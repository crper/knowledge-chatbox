"""Provider capability interfaces."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, TypeVar, runtime_checkable

from cachetools import LRUCache
from pydantic import BaseModel, ConfigDict, Field
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.enums import ProviderName, ReasoningMode
from knowledge_chatbox_api.schemas.chat import UsageData

logger = get_logger(__name__)

if TYPE_CHECKING:
    from collections.abc import Callable, Generator

    from knowledge_chatbox_api.schemas.settings import (
        EmbeddingRouteConfig,
        ProviderProfiles,
        ResponseRouteConfig,
        VisionRouteConfig,
    )

DEFAULT_VISION_PROMPT = "Describe the image content in markdown."

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _is_retryable_error(exc: BaseException) -> bool:
    """判断异常是否为可重试的临时故障（连接错误或可重试的 HTTP 状态码）。"""
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True
    from httpx import HTTPStatusError

    if isinstance(exc, HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS_CODES
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code in _RETRYABLE_STATUS_CODES
    return False


provider_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception(_is_retryable_error),
    reraise=True,
)


class ImagePart(BaseModel):
    """图片附件部分。"""

    data_base64: str = ""
    mime_type: str = "image/jpeg"


class ExtractedContentParts(BaseModel):
    """从消息内容块中预提取的文本和图片部分。"""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    text_parts: list[str] = Field(default_factory=lambda: [""])
    image_parts: list[ImagePart] = Field(default_factory=list)


ContentPart = str | list[dict[str, Any]] | None


def extract_content_parts(content: ContentPart) -> ExtractedContentParts:
    """从消息内容块中提取文本和图片部分。"""
    if isinstance(content, str):
        return ExtractedContentParts(text_parts=[content])
    if not isinstance(content, list):
        return ExtractedContentParts()

    text_parts: list[str] = []
    image_parts: list[ImagePart] = []
    item: dict[str, Any]
    for item in content:
        if item.get("type") == "text":
            text_parts.append(item.get("text", ""))
        elif item.get("type") == "image":
            image_parts.append(
                ImagePart(
                    data_base64=item.get("data_base64", ""),
                    mime_type=item.get("mime_type", "image/jpeg"),
                )
            )

    return ExtractedContentParts(
        text_parts=text_parts or [""],
        image_parts=image_parts,
    )


def transform_content(
    content: ContentPart,
    *,
    text_fn: Callable[[str], dict[str, Any]],
    image_fn: Callable[[ImagePart], dict[str, Any]],
    empty_text_fn: Callable[[], dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """将消息内容转换为 provider 特定格式。"""
    parts = extract_content_parts(content)
    blocks: list[dict[str, Any]] = [text_fn(t) for t in parts.text_parts if t]
    blocks.extend(image_fn(img) for img in parts.image_parts)
    if not blocks:
        blocks.append(empty_text_fn() if empty_text_fn else text_fn(""))
    return blocks


_T = TypeVar("_T")
_CacheKey = tuple[Any, ...]


class ClientCacheMixin:
    """通用 LRU 客户端缓存，供各 Provider Mixin 复用。"""

    def __init__(self, *, max_cache_size: int = 8) -> None:
        self._client_cache: LRUCache[_CacheKey, Any] = LRUCache(maxsize=max_cache_size)

    def _get_or_create_client(self, key: _CacheKey, factory: Callable[[], _T]) -> _T:
        try:
            return self._client_cache[key]
        except KeyError:
            value = factory()
            self._client_cache[key] = value
            return value

    def _run_provider_health_check(
        self,
        check_fn: Callable[[], Any],
    ) -> ProviderHealthResult:
        from time import perf_counter

        from knowledge_chatbox_api.utils.timing import elapsed_ms

        start = perf_counter()
        try:
            check_fn()
        except Exception as exc:
            logger.warning("provider_health_check_failed", error=str(exc))
            return ProviderHealthResult(healthy=False, message="Provider health check failed.")
        return ProviderHealthResult(healthy=True, message="ok", latency_ms=elapsed_ms(start))


def build_reasoning_config(provider: str, reasoning_mode: ReasoningMode) -> dict[str, Any]:
    """构建 provider 特定的推理配置，直接返回各 provider 可用的扁平参数。

    返回值可直接作为 ModelSettings 的关键字参数展开：
    - Anthropic: {"anthropic_thinking": {"type": "enabled", "budget_tokens": 10000}}
    - OpenAI: {"openai_reasoning_effort": "medium"}
    - Ollama: {"extra_body": {"think": True/False}}
    """
    match (provider, reasoning_mode):
        case (ProviderName.ANTHROPIC, ReasoningMode.ON):
            return {"anthropic_thinking": {"type": "enabled", "budget_tokens": 10000}}
        case (ProviderName.ANTHROPIC, ReasoningMode.OFF):
            return {"anthropic_thinking": {"type": "disabled"}}
        case (ProviderName.ANTHROPIC, _):
            return {}
        case (ProviderName.OLLAMA, ReasoningMode.ON):
            return {"extra_body": {"think": True}}
        case (ProviderName.OLLAMA, ReasoningMode.OFF):
            return {"extra_body": {"think": False}}
        case (ProviderName.OLLAMA, _):
            return {}
        case (_, ReasoningMode.ON):
            return {"openai_reasoning_effort": "medium"}
        case (_, ReasoningMode.OFF):
            return {"openai_reasoning_effort": "none"}
        case _:
            return {}


class ProviderHealthResult(BaseModel):
    """描述 capability 健康检查结果。"""

    healthy: bool
    message: str
    code: str | None = None
    latency_ms: int | None = None


class ResponseStreamChunk(BaseModel):
    """统一响应流分片。"""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: str
    delta: str | None = None
    error_message: str | None = None
    provider_response_id: str | None = None
    usage: UsageData | None = None
    raw: dict[str, Any] | None = None


class ProviderSettings(Protocol):
    """Provider 所需的基础设置协议。"""

    provider_profiles: ProviderProfiles
    provider_timeout_seconds: int


class ResponseSettings(ProviderSettings, Protocol):
    """Response capability 需要的设置。"""

    response_route: ResponseRouteConfig


class ResponseRuntimeSettings(ResponseSettings, Protocol):
    """生成响应时需要的完整设置。"""

    reasoning_mode: ReasoningMode


class EmbeddingSettings(ProviderSettings, Protocol):
    """Embedding capability 需要的设置。"""

    embedding_route: EmbeddingRouteConfig


class VisionSettings(ProviderSettings, Protocol):
    """Vision capability 需要的设置。"""

    vision_route: VisionRouteConfig


@runtime_checkable
class ResponseAdapterProtocol(Protocol):
    """统一 response capability 接口，使用结构化子类型替代 ABC 继承。"""

    def response(
        self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings
    ) -> str: ...

    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ) -> Generator[ResponseStreamChunk]: ...

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult: ...


@runtime_checkable
class EmbeddingAdapterProtocol(Protocol):
    """统一 embedding capability 接口，使用结构化子类型替代 ABC 继承。"""

    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]: ...

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult: ...


@runtime_checkable
class VisionAdapterProtocol(Protocol):
    """统一 vision capability 接口，使用结构化子类型替代 ABC 继承。"""

    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str: ...

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult: ...
