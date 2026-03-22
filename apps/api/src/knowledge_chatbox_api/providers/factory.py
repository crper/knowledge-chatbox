"""Provider capability factories."""

from __future__ import annotations

from collections.abc import Mapping
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


def build_response_adapter(
    route: ResponseRouteConfig | Mapping[str, Any] | None,
) -> BaseResponseAdapter:
    provider = parse_response_route(route).provider if route is not None else "openai"
    if provider == "anthropic":
        return AnthropicResponseAdapter()
    if provider == "ollama":
        return OllamaResponseAdapter()
    return OpenAIResponseAdapter()


def build_embedding_adapter(
    route: EmbeddingRouteConfig | Mapping[str, Any] | None,
) -> BaseEmbeddingAdapter:
    provider = parse_embedding_route(route).provider if route is not None else "openai"
    if provider == "voyage":
        return VoyageEmbeddingAdapter()
    if provider == "ollama":
        return OllamaEmbeddingAdapter()
    return OpenAIEmbeddingAdapter()


def build_vision_adapter(
    route: VisionRouteConfig | Mapping[str, Any] | None,
) -> BaseVisionAdapter:
    provider = parse_vision_route(route).provider if route is not None else "openai"
    if provider == "anthropic":
        return AnthropicVisionAdapter()
    if provider == "ollama":
        return OllamaVisionAdapter()
    return OpenAIVisionAdapter()


def build_response_adapter_from_settings(settings_record) -> BaseResponseAdapter:
    return build_response_adapter(getattr(settings_record, "response_route", None))


def build_embedding_adapter_from_settings(settings_record) -> BaseEmbeddingAdapter:
    return build_embedding_adapter(getattr(settings_record, "embedding_route", None))


def build_vision_adapter_from_settings(settings_record) -> BaseVisionAdapter:
    return build_vision_adapter(getattr(settings_record, "vision_route", None))
