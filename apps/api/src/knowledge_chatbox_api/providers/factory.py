"""Provider capability factories."""

from typing import Any, TypeVar, cast

from cachetools import LRUCache

from knowledge_chatbox_api.models.enums import ProviderName
from knowledge_chatbox_api.providers.anthropic_provider import (
    AnthropicResponseAdapter,
    AnthropicVisionAdapter,
)
from knowledge_chatbox_api.providers.base import (
    BaseEmbeddingAdapter,
    BaseResponseAdapter,
    BaseVisionAdapter,
)
from knowledge_chatbox_api.providers.ollama_provider import (
    OllamaEmbeddingAdapter,
    OllamaResponseAdapter,
    OllamaVisionAdapter,
)
from knowledge_chatbox_api.providers.openai_provider import (
    OpenAIEmbeddingAdapter,
    OpenAIResponseAdapter,
    OpenAIVisionAdapter,
)
from knowledge_chatbox_api.providers.voyage_provider import VoyageEmbeddingAdapter
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ResponseRouteConfig,
    VisionRouteConfig,
    parse_embedding_route,
    parse_response_route,
    parse_vision_route,
)

_RESPONSE_REGISTRY: dict[str, type[BaseResponseAdapter]] = {
    ProviderName.ANTHROPIC: AnthropicResponseAdapter,
    ProviderName.OLLAMA: OllamaResponseAdapter,
    ProviderName.OPENAI: OpenAIResponseAdapter,
}

_EMBEDDING_REGISTRY: dict[str, type[BaseEmbeddingAdapter]] = {
    ProviderName.OLLAMA: OllamaEmbeddingAdapter,
    ProviderName.OPENAI: OpenAIEmbeddingAdapter,
    ProviderName.VOYAGE: VoyageEmbeddingAdapter,
}

_VISION_REGISTRY: dict[str, type[BaseVisionAdapter]] = {
    ProviderName.ANTHROPIC: AnthropicVisionAdapter,
    ProviderName.OLLAMA: OllamaVisionAdapter,
    ProviderName.OPENAI: OpenAIVisionAdapter,
}

_adapter_cache: LRUCache[
    tuple[str, str], BaseResponseAdapter | BaseEmbeddingAdapter | BaseVisionAdapter
] = LRUCache(maxsize=16)

_T = TypeVar("_T", BaseResponseAdapter, BaseEmbeddingAdapter, BaseVisionAdapter)


def _resolve_adapter(  # noqa: UP047
    registry: dict[str, type[_T]],
    default: str,
    route: Any,
) -> _T:
    provider_name = getattr(route, "provider", None) or default
    adapter_cls = registry.get(provider_name)
    if adapter_cls is None:
        adapter_cls = registry[default]
    cache_key = (adapter_cls.__name__, provider_name)
    try:
        return cast("_T", _adapter_cache[cache_key])
    except KeyError:
        value = adapter_cls()
        _adapter_cache[cache_key] = value
        return value


def build_response_adapter(
    route: ResponseRouteConfig | dict[str, Any] | None,
) -> BaseResponseAdapter:
    parsed = parse_response_route(route) if route is not None else None
    return _resolve_adapter(_RESPONSE_REGISTRY, ProviderName.OPENAI, parsed)


def build_embedding_adapter(
    route: EmbeddingRouteConfig | dict[str, Any] | None,
) -> BaseEmbeddingAdapter:
    parsed = parse_embedding_route(route) if route is not None else None
    return _resolve_adapter(_EMBEDDING_REGISTRY, ProviderName.OPENAI, parsed)


def build_vision_adapter(
    route: VisionRouteConfig | dict[str, Any] | None,
) -> BaseVisionAdapter:
    parsed = parse_vision_route(route) if route is not None else None
    return _resolve_adapter(_VISION_REGISTRY, ProviderName.OPENAI, parsed)


def build_response_adapter_from_settings(settings_record: Any) -> BaseResponseAdapter:
    return build_response_adapter(settings_record.response_route)


def build_embedding_adapter_from_settings(settings_record: Any) -> BaseEmbeddingAdapter:
    return build_embedding_adapter(settings_record.embedding_route)


def build_vision_adapter_from_settings(settings_record: Any) -> BaseVisionAdapter:
    return build_vision_adapter(settings_record.vision_route)
