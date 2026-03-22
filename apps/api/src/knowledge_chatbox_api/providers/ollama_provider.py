"""Ollama capability adapters."""

from __future__ import annotations

import base64
import time
from typing import Any

from ollama import Client, RequestError

from knowledge_chatbox_api.providers.base import (
    BaseEmbeddingAdapter,
    BaseResponseAdapter,
    BaseVisionAdapter,
    EmbeddingSettings,
    ProviderHealthResult,
    ProviderSettings,
    ResponseRuntimeSettings,
    ResponseSettings,
    ResponseStreamChunk,
    VisionSettings,
)

OLLAMA_BASE_URL_UNREACHABLE_CODE = "ollama_base_url_unreachable"


def _ollama_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    return status_code if isinstance(status_code, int) else None


def _ollama_failure_message(
    exc: Exception,
    *,
    host: str,
    model: str | None = None,
) -> ProviderHealthResult:
    status_code = _ollama_status_code(exc)
    if status_code == 502:
        return ProviderHealthResult(
            healthy=False,
            code=OLLAMA_BASE_URL_UNREACHABLE_CODE,
            message=(
                f"Ollama Base URL {host} returned 502 Bad Gateway."
                if host
                else "Ollama service returned 502 Bad Gateway."
            ),
        )
    if isinstance(exc, RequestError):
        return ProviderHealthResult(
            healthy=False,
            code=OLLAMA_BASE_URL_UNREACHABLE_CODE,
            message=(
                f"Unable to reach Ollama at {host}."
                if host
                else "Unable to reach the Ollama service."
            ),
        )
    if status_code == 404 and model:
        return ProviderHealthResult(
            healthy=False,
            message=f"Ollama model {model} is not available.",
        )
    return ProviderHealthResult(healthy=False, message=str(exc))


def _attr(value: Any, name: str, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _message_content(response: Any) -> str:
    message = _attr(response, "message")
    if message is None and isinstance(response, dict):
        message = response.get("message")
    content = _attr(message, "content")
    if isinstance(content, str):
        return content
    fallback = _attr(response, "response")
    return fallback if isinstance(fallback, str) else ""


def _usage_to_dict(response: Any) -> dict[str, Any] | None:
    eval_count = _attr(response, "eval_count")
    if eval_count is None:
        return None
    return {"output_tokens": eval_count}


def _raw_dict(response: Any) -> dict[str, Any] | None:
    if response is None:
        return None
    if isinstance(response, dict):
        return response
    if hasattr(response, "model_dump"):
        return response.model_dump()
    return None


class _OllamaClientMixin:
    def __init__(self, client_factory=None) -> None:
        self.client_factory = client_factory or Client
        self._client_cache: dict[tuple[str, float], Any] = {}

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _host(self, settings: ProviderSettings) -> str:
        return (
            settings.provider_profiles.ollama.base_url or "http://host.docker.internal:11434"
        ).rstrip("/")

    def _client(self, settings: ProviderSettings):
        host = self._host(settings)
        timeout = self._request_timeout(settings)
        cache_key = (host, timeout)
        client = self._client_cache.get(cache_key)
        if client is None:
            client = self.client_factory(host=host, timeout=timeout)
            self._client_cache[cache_key] = client
        return client

    def _quick_model_check(self, settings: ProviderSettings, model: str) -> None:
        self._client(settings).show(model)

    def _think_config(self, settings: ResponseRuntimeSettings) -> bool:
        return settings.reasoning_mode == "on"

    def _serialize_messages(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        serialized_messages: list[dict[str, Any]] = []
        for message in messages:
            content = message.get("content")
            if not isinstance(content, list):
                serialized_messages.append(
                    {
                        "role": message.get("role"),
                        "content": content if isinstance(content, str) else "",
                    }
                )
                continue

            text_parts: list[str] = []
            images: list[str] = []
            for item in content:
                if item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                elif item.get("type") == "image":
                    images.append(item.get("data_base64", ""))

            payload: dict[str, Any] = {
                "role": message.get("role"),
                "content": "\n\n".join(part for part in text_parts if part),
            }
            if images:
                payload["images"] = images
            serialized_messages.append(payload)

        return serialized_messages


class OllamaResponseAdapter(_OllamaClientMixin, BaseResponseAdapter):
    """Ollama 聊天适配器。"""

    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        response = self._client(settings).chat(
            model=settings.response_route.model,
            messages=self._serialize_messages(messages),
            stream=False,
            think=self._think_config(settings),
        )
        return _message_content(response)

    def stream_response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings):
        try:
            stream = self._client(settings).chat(
                model=settings.response_route.model,
                messages=self._serialize_messages(messages),
                stream=True,
                think=self._think_config(settings),
            )
            for chunk in stream:
                content = _message_content(chunk)
                if content:
                    yield ResponseStreamChunk(
                        type="text_delta",
                        delta=content,
                        raw=_raw_dict(chunk),
                    )
                if _attr(chunk, "done") is True:
                    yield ResponseStreamChunk(
                        type="completed",
                        usage=_usage_to_dict(chunk),
                        raw=_raw_dict(chunk),
                    )
                    return
        except Exception as exc:  # noqa: BLE001
            yield ResponseStreamChunk(type="error", error_message=str(exc))

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            self._quick_model_check(settings, settings.response_route.model)
        except Exception as exc:  # noqa: BLE001
            return _ollama_failure_message(
                exc,
                host=self._host(settings),
                model=settings.response_route.model,
            )
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )


class OllamaEmbeddingAdapter(_OllamaClientMixin, BaseEmbeddingAdapter):
    """Ollama embedding 适配器。"""

    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        response = self._client(settings).embed(model=settings.embedding_route.model, input=texts)
        embeddings = _attr(response, "embeddings")
        if isinstance(embeddings, list):
            return embeddings
        if embeddings is not None:
            return list(embeddings)
        return []

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            self.embed(["ping"], settings)
        except Exception as exc:  # noqa: BLE001
            return _ollama_failure_message(
                exc,
                host=self._host(settings),
                model=settings.embedding_route.model,
            )
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )


class OllamaVisionAdapter(_OllamaClientMixin, BaseVisionAdapter):
    """Ollama vision 适配器。"""

    supports_vision = True

    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        encoded_images = [
            base64.b64encode(item.get("bytes", b"")).decode("utf-8") for item in inputs
        ]
        response = self._client(settings).chat(
            model=settings.vision_route.model,
            messages=[
                {
                    "role": "user",
                    "content": "Describe the image content in markdown.",
                    "images": encoded_images,
                }
            ],
            stream=False,
            think=False,
        )
        return _message_content(response)

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            self._quick_model_check(settings, settings.vision_route.model)
        except Exception as exc:  # noqa: BLE001
            return _ollama_failure_message(
                exc,
                host=self._host(settings),
                model=settings.vision_route.model,
            )
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
