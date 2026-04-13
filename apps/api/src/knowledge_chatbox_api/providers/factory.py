"""Provider capability factories."""

from typing import TypeVar

from cachetools import LRUCache

from knowledge_chatbox_api.models.enums import ProviderName
from knowledge_chatbox_api.providers.anthropic_provider import (
    AnthropicResponseAdapter,
    AnthropicVisionAdapter,
)
from knowledge_chatbox_api.providers.base import (
    EmbeddingAdapterProtocol,
    ResponseAdapterProtocol,
    VisionAdapterProtocol,
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

_ResponseAdapter = AnthropicResponseAdapter | OllamaResponseAdapter | OpenAIResponseAdapter
_EmbeddingAdapter = OllamaEmbeddingAdapter | OpenAIEmbeddingAdapter | VoyageEmbeddingAdapter
_VisionAdapter = AnthropicVisionAdapter | OllamaVisionAdapter | OpenAIVisionAdapter

_RESPONSE_REGISTRY: dict[str, type[_ResponseAdapter]] = {
    ProviderName.ANTHROPIC: AnthropicResponseAdapter,
    ProviderName.OLLAMA: OllamaResponseAdapter,
    ProviderName.OPENAI: OpenAIResponseAdapter,
}

_EMBEDDING_REGISTRY: dict[str, type[_EmbeddingAdapter]] = {
    ProviderName.OLLAMA: OllamaEmbeddingAdapter,
    ProviderName.OPENAI: OpenAIEmbeddingAdapter,
    ProviderName.VOYAGE: VoyageEmbeddingAdapter,
}

_VISION_REGISTRY: dict[str, type[_VisionAdapter]] = {
    ProviderName.ANTHROPIC: AnthropicVisionAdapter,
    ProviderName.OLLAMA: OllamaVisionAdapter,
    ProviderName.OPENAI: OpenAIVisionAdapter,
}

_T = TypeVar("_T", _ResponseAdapter, _EmbeddingAdapter, _VisionAdapter)

_adapter_cache: LRUCache[tuple[str, str], _T] = LRUCache(maxsize=16)


def _resolve_adapter[T: (_ResponseAdapter, _EmbeddingAdapter, _VisionAdapter)](
    registry: dict[str, type[T]],
    default: str,
    route: ResponseRouteConfig | EmbeddingRouteConfig | VisionRouteConfig | None,
) -> T:
    provider_name = getattr(route, "provider", None) or default
    adapter_cls = registry.get(provider_name, registry[default])
    cache_key = (adapter_cls.__name__, provider_name)
    try:
        return _adapter_cache[cache_key]
    except KeyError:
        value = adapter_cls()
        _adapter_cache[cache_key] = value
        return value


def build_response_adapter(
    route: ResponseRouteConfig | dict[str, str] | None,
) -> ResponseAdapterProtocol:
    parsed = parse_response_route(route) if route is not None else None
    return _resolve_adapter(_RESPONSE_REGISTRY, ProviderName.OPENAI, parsed)


def build_embedding_adapter(
    route: EmbeddingRouteConfig | dict[str, str] | None,
) -> EmbeddingAdapterProtocol:
    parsed = parse_embedding_route(route) if route is not None else None
    return _resolve_adapter(_EMBEDDING_REGISTRY, ProviderName.OPENAI, parsed)


def build_vision_adapter(
    route: VisionRouteConfig | dict[str, str] | None,
) -> VisionAdapterProtocol:
    parsed = parse_vision_route(route) if route is not None else None
    return _resolve_adapter(_VISION_REGISTRY, ProviderName.OPENAI, parsed)
