"""Provider capability interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Protocol, TypeVar

from cachetools import LRUCache
from pydantic import BaseModel, ConfigDict
from tenacity import retry, stop_after_attempt, wait_exponential

from knowledge_chatbox_api.models.enums import ProviderName, ReasoningMode

if TYPE_CHECKING:
    from collections.abc import Callable, Generator

    from knowledge_chatbox_api.schemas.settings import (
        EmbeddingRouteConfig,
        ProviderProfiles,
        ResponseRouteConfig,
        VisionRouteConfig,
    )

DEFAULT_VISION_PROMPT = "Describe the image content in markdown."

provider_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)


class ExtractedContentParts:
    """Pre-extracted text and image parts from a message content block."""

    __slots__ = ("image_parts", "text_parts")

    def __init__(
        self,
        *,
        text_parts: list[str] | None = None,
        image_parts: list[dict[str, str]] | None = None,
    ) -> None:
        self.text_parts: list[str] = text_parts if text_parts is not None else [""]
        self.image_parts: list[dict[str, str]] = image_parts if image_parts is not None else []


def extract_content_parts(content: Any) -> ExtractedContentParts:
    """Extract text and image parts from a message content block.

    Each image part dict contains ``data_base64`` and ``mime_type`` keys.
    Returns an ExtractedContentParts with at least one text part (empty string
    as fallback) and zero or more image parts.
    """
    if isinstance(content, str):
        return ExtractedContentParts(text_parts=[content])
    if not isinstance(content, list):
        return ExtractedContentParts()

    text_parts: list[str] = []
    image_parts: list[dict[str, str]] = []
    item: dict[str, Any]
    for item in content:
        if item.get("type") == "text":
            text_parts.append(item.get("text", ""))
        elif item.get("type") == "image":
            image_parts.append(
                {
                    "data_base64": item.get("data_base64", ""),
                    "mime_type": item.get("mime_type", "image/jpeg"),
                }
            )

    return ExtractedContentParts(
        text_parts=text_parts or [""],
        image_parts=image_parts,
    )


def transform_content(
    content: Any,
    *,
    text_fn: Callable[[str], dict[str, Any]],
    image_fn: Callable[[dict[str, str]], dict[str, Any]],
    empty_text_fn: Callable[[], dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Transform message content into provider-specific block format.

    Applies ``text_fn`` to each non-empty text part and ``image_fn`` to each
    image part.  If the result is empty, falls back to ``empty_text_fn`` or
    ``text_fn("")``.
    """
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

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _run_provider_health_check(
        self,
        check_fn: Callable[[], Any],
    ) -> ProviderHealthResult:
        from time import perf_counter

        from knowledge_chatbox_api.core.logging import get_logger
        from knowledge_chatbox_api.utils.timing import elapsed_ms

        _logger = get_logger(__name__)
        start = perf_counter()
        try:
            check_fn()
        except Exception as exc:
            _logger.warning("provider_health_check_failed", error=str(exc))
            return ProviderHealthResult(healthy=False, message="Provider health check failed.")
        return ProviderHealthResult(healthy=True, message="ok", latency_ms=elapsed_ms(start))


def build_reasoning_config(provider: str, reasoning_mode: ReasoningMode) -> dict[str, Any]:
    match (provider, reasoning_mode):
        case (ProviderName.ANTHROPIC, ReasoningMode.ON):
            return {"anthropic_thinking": {"type": "enabled", "budget_tokens": 10000}}
        case (ProviderName.ANTHROPIC, ReasoningMode.OFF):
            return {"anthropic_thinking": {"type": "disabled"}}
        case (ProviderName.ANTHROPIC, _):
            return {}
        case (ProviderName.OLLAMA, _):
            return {"extra_body": {"think": reasoning_mode == ReasoningMode.ON}}
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
    usage: dict[str, Any] | None = None
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


class BaseResponseAdapter(ABC):
    """统一 response capability 接口。"""

    @abstractmethod
    def response(
        self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings
    ) -> str: ...

    @abstractmethod
    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ) -> Generator[ResponseStreamChunk, None, None]:
        raise NotImplementedError

    @abstractmethod
    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult: ...


class BaseEmbeddingAdapter(ABC):
    """统一 embedding capability 接口。"""

    @abstractmethod
    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]: ...

    @abstractmethod
    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult: ...


class BaseVisionAdapter(ABC):
    """统一 vision capability 接口。"""

    @abstractmethod
    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str: ...

    @abstractmethod
    def health_check(self, settings: VisionSettings) -> ProviderHealthResult: ...
