from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
from pytest_httpx import HTTPXMock

from knowledge_chatbox_api.providers.anthropic_provider import AnthropicResponseAdapter
from knowledge_chatbox_api.providers.ollama_provider import (
    OllamaEmbeddingAdapter,
    OllamaResponseAdapter,
    OllamaVisionAdapter,
)
from knowledge_chatbox_api.providers.openai_provider import OpenAIResponseAdapter
from knowledge_chatbox_api.providers.voyage_provider import VoyageEmbeddingAdapter
from knowledge_chatbox_api.services.settings.runtime_settings import parse_runtime_settings


def make_runtime_settings(**overrides):
    payload = {
        "provider_profiles": {
            "openai": {
                "api_key": "key",
                "base_url": "https://api.openai.com/v1",
            },
            "anthropic": {
                "api_key": "key",
                "base_url": "https://api.anthropic.com",
            },
            "voyage": {
                "api_key": "voyage-key",
                "base_url": "https://api.voyageai.com/v1",
            },
            "ollama": {
                "base_url": "http://localhost:11434",
            },
        },
        "response_route": {"provider": "openai", "model": "gpt-5.4"},
        "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
        "vision_route": {"provider": "openai", "model": "gpt-5.4"},
        "provider_timeout_seconds": 60,
        "reasoning_mode": "default",
    }
    payload.update(overrides)
    return parse_runtime_settings(payload)


def test_openai_response_adapter_streams_response_events() -> None:
    class FakeStream:
        def __enter__(self):
            return iter(
                [
                    SimpleNamespace(
                        type="response.output_text.delta",
                        delta="hello ",
                        response_id="resp_1",
                    ),
                    SimpleNamespace(
                        type="response.output_text.delta",
                        delta="world",
                        response_id="resp_1",
                    ),
                    SimpleNamespace(type="response.completed", response_id="resp_1"),
                ]
            )

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeResponses:
        def stream(self, **kwargs):
            assert kwargs["model"] == "gpt-5.4"
            return FakeStream()

    class FakeClient:
        def __init__(self) -> None:
            self.responses = FakeResponses()

    adapter = OpenAIResponseAdapter(client_factory=lambda **kwargs: FakeClient())
    settings = make_runtime_settings()

    events = list(adapter.stream_response([{"role": "user", "content": "hello"}], settings))

    assert [event.type for event in events] == ["text_delta", "text_delta", "completed"]
    assert [event.delta for event in events[:-1]] == ["hello ", "world"]


def test_anthropic_response_adapter_streams_messages_events() -> None:
    class FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        @property
        def text_stream(self):
            return iter(["hello ", "world"])

        def get_final_message(self):
            return {"id": "msg_123", "usage": {"output_tokens": 2}}

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.messages = SimpleNamespace(
                stream=lambda **kwargs: FakeStream(),
            )

    adapter = AnthropicResponseAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        response_route={"provider": "anthropic", "model": "claude-sonnet-4-5"},
    )

    events = list(adapter.stream_response([{"role": "user", "content": "hello"}], settings))

    assert [event.type for event in events] == ["text_delta", "text_delta", "completed"]
    assert [event.delta for event in events[:-1]] == ["hello ", "world"]


def test_ollama_response_adapter_streams_json_lines() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def chat(self, **kwargs):
            return iter(
                [
                    {"message": {"content": "hello "}, "done": False},
                    {"message": {"content": "world"}, "done": False},
                    {"message": {"content": ""}, "done": True},
                ]
            )

    adapter = OllamaResponseAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        response_route={"provider": "ollama", "model": "qwen3.5:4b"},
    )

    events = list(adapter.stream_response([{"role": "user", "content": "hello"}], settings))

    assert [event.type for event in events] == ["text_delta", "text_delta", "completed"]
    assert [event.delta for event in events[:-1]] == ["hello ", "world"]


def test_voyage_embedding_adapter_calls_embeddings_api(httpx_mock: HTTPXMock) -> None:
    def callback(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert request.headers["Authorization"] == "Bearer voyage-key"
        assert payload == {"input": ["hello", "world"], "model": "voyage-3.5"}
        return httpx.Response(
            200,
            json={"data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}]},
        )

    httpx_mock.add_callback(
        callback,
        method="POST",
        url="https://api.voyageai.com/v1/embeddings",
    )

    adapter = VoyageEmbeddingAdapter()
    settings = make_runtime_settings(
        embedding_route={"provider": "voyage", "model": "voyage-3.5"},
        provider_timeout_seconds=30,
    )

    result = adapter.embed(["hello", "world"], settings)

    assert result == [[0.1, 0.2], [0.3, 0.4]]


def test_ollama_embedding_adapter_uses_embed_api(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url="http://localhost:11434/api/embed",
        json={"embeddings": [[0.1, 0.2], [0.3, 0.4]]},
    )

    adapter = OllamaEmbeddingAdapter()
    settings = make_runtime_settings(
        embedding_route={"provider": "ollama", "model": "nomic-embed-text"},
        provider_timeout_seconds=30,
    )

    result = adapter.embed(["hello", "world"], settings)

    assert result == [[0.1, 0.2], [0.3, 0.4]]


def test_openai_response_health_check_accepts_model_list_only_gateways() -> None:
    class GatewayNotFoundError(Exception):
        status_code = 404

    class FakeModels:
        def retrieve(self, model: str):
            raise GatewayNotFoundError("404 page not found")

        def list(self):
            return SimpleNamespace(data=[SimpleNamespace(id="gpt-5.4")])

    class FakeResponses:
        def create(self, **kwargs):
            raise AssertionError("responses.create should not be used for quick health checks")

    class FakeClient:
        def __init__(self) -> None:
            self.models = FakeModels()
            self.responses = FakeResponses()

    adapter = OpenAIResponseAdapter(client_factory=lambda **kwargs: FakeClient())
    settings = make_runtime_settings()

    result = adapter.health_check(settings)

    assert result.healthy is True


def test_openai_response_health_check_rejects_invalid_api_key() -> None:
    class GatewayAuthenticationError(Exception):
        status_code = 401
        code = "INVALID_API_KEY"

    class FakeModels:
        def retrieve(self, model: str):
            raise GatewayAuthenticationError("Invalid API key")

        def list(self):
            raise AssertionError("models.list should not be used when auth fails")

    class FakeResponses:
        def create(self, **kwargs):
            raise AssertionError("responses.create should not be used for quick health checks")

    class FakeClient:
        def __init__(self) -> None:
            self.models = FakeModels()
            self.responses = FakeResponses()

    adapter = OpenAIResponseAdapter(client_factory=lambda **kwargs: FakeClient())
    settings = make_runtime_settings()

    result = adapter.health_check(settings)

    assert result.healthy is False
    assert result.code == "openai_invalid_api_key"
    assert result.message == "OpenAI API key is invalid or rejected by the gateway."


def test_openai_response_health_check_rejects_missing_model_from_list() -> None:
    class GatewayNotFoundError(Exception):
        status_code = 404

    class FakeModels:
        def retrieve(self, model: str):
            raise GatewayNotFoundError("404 page not found")

        def list(self):
            return SimpleNamespace(data=[SimpleNamespace(id="gpt-4.1")])

    class FakeResponses:
        def create(self, **kwargs):
            raise AssertionError("responses.create should not be used for quick health checks")

    class FakeClient:
        def __init__(self) -> None:
            self.models = FakeModels()
            self.responses = FakeResponses()

    adapter = OpenAIResponseAdapter(client_factory=lambda **kwargs: FakeClient())
    settings = make_runtime_settings()

    result = adapter.health_check(settings)

    assert result.healthy is False
    assert result.code == "openai_model_not_available"
    assert result.message == "OpenAI model gpt-5.4 is not available."


def test_ollama_response_health_check_prefers_show_over_chat() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3.5:4b"
            return {"model": model, "capabilities": ["completion"]}

        def chat(self, **kwargs):
            raise AssertionError("chat should not be used for quick Ollama response checks")

    adapter = OllamaResponseAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        response_route={"provider": "ollama", "model": "qwen3.5:4b"},
    )

    result = adapter.health_check(settings)

    assert result.healthy is True


def test_ollama_response_health_check_strips_v1_suffix_for_sdk_host() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3.5:4b"
            assert self.kwargs["host"] == "http://localhost:11434"
            return {"model": model, "capabilities": ["completion"]}

    adapter = OllamaResponseAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        response_route={"provider": "ollama", "model": "qwen3.5:4b"},
        provider_profiles={
            "ollama": {
                "base_url": "http://localhost:11434/v1/",
            }
        },
    )

    result = adapter.health_check(settings)

    assert result.healthy is True


def test_ollama_embedding_health_check_prefers_show_over_embed() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "nomic-embed-text"
            return {"model": model, "capabilities": ["embedding"]}

        def embed(self, **kwargs):
            raise AssertionError("embed should not be used for quick Ollama embedding checks")

    adapter = OllamaEmbeddingAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        embedding_route={"provider": "ollama", "model": "nomic-embed-text"},
    )

    result = adapter.health_check(settings)

    assert result.healthy is True


def test_ollama_embedding_health_check_rejects_models_without_embedding_capability() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3.5:4b"
            return {"model": model, "capabilities": ["completion"]}

    adapter = OllamaEmbeddingAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        embedding_route={"provider": "ollama", "model": "qwen3.5:4b"},
    )

    result = adapter.health_check(settings)

    assert result.healthy is False
    assert (
        result.message
        == "Ollama model qwen3.5:4b does not support required capabilities: embedding."
    )


def test_ollama_response_health_check_marks_bad_gateway_as_base_url_unreachable() -> None:
    class FakeOllamaResponseError(Exception):
        def __init__(self, message: str, status_code: int) -> None:
            super().__init__(message)
            self.status_code = status_code

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3.5:4b"
            raise FakeOllamaResponseError("Bad Gateway", 502)

    adapter = OllamaResponseAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        response_route={"provider": "ollama", "model": "qwen3.5:4b"},
        provider_profiles={
            "ollama": {
                "base_url": "http://host.docker.internal:11434",
            }
        },
    )

    result = adapter.health_check(settings)

    assert result.healthy is False
    assert result.code == "ollama_base_url_unreachable"
    assert (
        result.message
        == "Ollama Base URL http://host.docker.internal:11434 returned 502 Bad Gateway."
    )


def test_ollama_vision_health_check_prefers_show_over_chat() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3.5:4b"
            return {"model": model, "capabilities": ["completion", "vision"]}

        def chat(self, **kwargs):
            raise AssertionError("chat should not be used for quick Ollama vision checks")

    adapter = OllamaVisionAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        vision_route={"provider": "ollama", "model": "qwen3.5:4b"},
    )

    result = adapter.health_check(settings)

    assert result.healthy is True


def test_ollama_vision_health_check_rejects_models_without_vision_capability() -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def show(self, model: str):
            assert model == "qwen3:4b"
            return {"model": model, "capabilities": ["completion"]}

    adapter = OllamaVisionAdapter(client_factory=FakeClient)
    settings = make_runtime_settings(
        vision_route={"provider": "ollama", "model": "qwen3:4b"},
    )

    result = adapter.health_check(settings)

    assert result.healthy is False
    assert result.message == "Ollama model qwen3:4b does not support required capabilities: vision."
