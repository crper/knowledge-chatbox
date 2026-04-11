"""Provider capability interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import OrderedDict
from collections.abc import Callable
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict
from tenacity import retry, stop_after_attempt, wait_exponential

from knowledge_chatbox_api.models.enums import ProviderName, ReasoningMode
from knowledge_chatbox_api.schemas._validators import ReasoningModeLiteral
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


class SimpleLRUCache:
    """基于 OrderedDict 的 LRU 缓存，供 ClientCacheMixin 和 factory 复用。"""

    def __init__(self, *, max_size: int = 8) -> None:
        self._cache: OrderedDict[tuple, Any] = OrderedDict()
        self._max_size = max_size

    def get_or_create(self, key: tuple, factory: Callable[[], Any]) -> Any:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        if len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        value = factory()
        self._cache[key] = value
        return value


class ClientCacheMixin:
    """通用 LRU 客户端缓存，供各 Provider Mixin 复用。"""

    def __init__(self, *, max_cache_size: int = 8) -> None:
        self._client_cache = SimpleLRUCache(max_size=max_cache_size)

    def _get_or_create_client(self, key: tuple, factory: Callable[[], Any]) -> Any:
        return self._client_cache.get_or_create(key, factory)

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _run_provider_health_check(
        self,
        check_fn: Callable[[], Any],
        *,
        api_key_label: str = "API key",
    ) -> ProviderHealthResult:
        import logging
        from time import perf_counter

        from knowledge_chatbox_api.utils.timing import elapsed_ms

        _logger = logging.getLogger(__name__)
        start = perf_counter()
        try:
            check_fn()
        except Exception as exc:  # noqa: BLE001
            _logger.warning("provider_health_check_failed: %s", exc)
            return ProviderHealthResult(healthy=False, message="Provider health check failed.")
        return ProviderHealthResult(healthy=True, message="ok", latency_ms=elapsed_ms(start))


def build_reasoning_config(provider: str, reasoning_mode: ReasoningModeLiteral) -> dict[str, Any]:
    if provider == ProviderName.ANTHROPIC:
        if reasoning_mode == ReasoningMode.ON:
            return {"anthropic_thinking": {"type": "enabled", "budget_tokens": 10000}}
        if reasoning_mode == ReasoningMode.OFF:
            return {"anthropic_thinking": {"type": "disabled"}}
        return {}
    if provider == ProviderName.OLLAMA:
        return {"extra_body": {"think": reasoning_mode == ReasoningMode.ON}}
    if reasoning_mode == ReasoningMode.ON:
        return {"openai_reasoning_effort": "medium"}
    if reasoning_mode == ReasoningMode.OFF:
        return {"openai_reasoning_effort": "none"}
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

    reasoning_mode: ReasoningModeLiteral


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
    ):
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
