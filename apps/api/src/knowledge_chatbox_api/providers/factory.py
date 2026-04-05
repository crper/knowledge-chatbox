"""Provider capability factories."""

from __future__ import annotations

from typing import Any

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
    "anthropic": AnthropicResponseAdapter,
    "ollama": OllamaResponseAdapter,
    "openai": OpenAIResponseAdapter,
}

_EMBEDDING_REGISTRY: dict[str, type[BaseEmbeddingAdapter]] = {
    "ollama": OllamaEmbeddingAdapter,
    "openai": OpenAIEmbeddingAdapter,
    "voyage": VoyageEmbeddingAdapter,
}

_VISION_REGISTRY: dict[str, type[BaseVisionAdapter]] = {
    "anthropic": AnthropicVisionAdapter,
    "ollama": OllamaVisionAdapter,
    "openai": OpenAIVisionAdapter,
}


def _resolve_adapter(
    registry: dict[str, type[Any]],
    default: str,
    route: Any,
) -> Any:
    provider_name = getattr(route, "provider", None) or default
    adapter_cls = registry.get(provider_name)
    if adapter_cls is None:
        adapter_cls = registry[default]
    return adapter_cls()


def build_response_adapter(
    route: ResponseRouteConfig | dict[str, Any] | None,
) -> BaseResponseAdapter:
    parsed = parse_response_route(route) if route is not None else None
    return _resolve_adapter(_RESPONSE_REGISTRY, "openai", parsed)


def build_embedding_adapter(
    route: EmbeddingRouteConfig | dict[str, Any] | None,
) -> BaseEmbeddingAdapter:
    parsed = parse_embedding_route(route) if route is not None else None
    return _resolve_adapter(_EMBEDDING_REGISTRY, "openai", parsed)


def build_vision_adapter(
    route: VisionRouteConfig | dict[str, Any] | None,
) -> BaseVisionAdapter:
    parsed = parse_vision_route(route) if route is not None else None
    return _resolve_adapter(_VISION_REGISTRY, "openai", parsed)


def build_response_adapter_from_settings(settings_record) -> BaseResponseAdapter:
    return build_response_adapter(getattr(settings_record, "response_route", None))


def build_embedding_adapter_from_settings(settings_record) -> BaseEmbeddingAdapter:
    return build_embedding_adapter(getattr(settings_record, "embedding_route", None))


def build_vision_adapter_from_settings(settings_record) -> BaseVisionAdapter:
    return build_vision_adapter(getattr(settings_record, "vision_route", None))
