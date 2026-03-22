from __future__ import annotations

from knowledge_chatbox_api.providers.anthropic_provider import (
    AnthropicResponseAdapter,
    AnthropicVisionAdapter,
)
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_response_adapter,
    build_vision_adapter,
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
)


def test_build_response_adapter_returns_expected_type() -> None:
    assert isinstance(
        build_response_adapter({"provider": "openai", "model": "gpt-5.4"}),
        OpenAIResponseAdapter,
    )
    assert isinstance(
        build_response_adapter({"provider": "anthropic", "model": "claude-sonnet-4-5"}),
        AnthropicResponseAdapter,
    )
    assert isinstance(
        build_response_adapter({"provider": "ollama", "model": "qwen3.5:4b"}),
        OllamaResponseAdapter,
    )


def test_build_embedding_adapter_returns_expected_type() -> None:
    assert isinstance(
        build_embedding_adapter({"provider": "openai", "model": "text-embedding-3-small"}),
        OpenAIEmbeddingAdapter,
    )
    assert isinstance(
        build_embedding_adapter({"provider": "voyage", "model": "voyage-3.5"}),
        VoyageEmbeddingAdapter,
    )
    assert isinstance(
        build_embedding_adapter({"provider": "ollama", "model": "nomic-embed-text"}),
        OllamaEmbeddingAdapter,
    )


def test_build_vision_adapter_returns_expected_type() -> None:
    assert isinstance(
        build_vision_adapter({"provider": "openai", "model": "gpt-5.4"}),
        OpenAIVisionAdapter,
    )
    assert isinstance(
        build_vision_adapter({"provider": "anthropic", "model": "claude-sonnet-4-5"}),
        AnthropicVisionAdapter,
    )
    assert isinstance(
        build_vision_adapter({"provider": "ollama", "model": "qwen3.5:4b"}),
        OllamaVisionAdapter,
    )


def test_build_provider_adapters_accept_typed_route_models() -> None:
    assert isinstance(
        build_response_adapter(
            ResponseRouteConfig(provider="anthropic", model="claude-sonnet-4-5")
        ),
        AnthropicResponseAdapter,
    )
    assert isinstance(
        build_embedding_adapter(EmbeddingRouteConfig(provider="voyage", model="voyage-3.5")),
        VoyageEmbeddingAdapter,
    )
    assert isinstance(
        build_vision_adapter(VisionRouteConfig(provider="ollama", model="qwen3.5:4b")),
        OllamaVisionAdapter,
    )
