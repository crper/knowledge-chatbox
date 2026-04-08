"""Ollama capability adapters."""

from __future__ import annotations

import base64
import os
import time
from functools import lru_cache
from typing import Any

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
from knowledge_chatbox_api.providers.ollama_url import normalize_ollama_base_url
from knowledge_chatbox_api.utils.compat import safe_getattr

OLLAMA_BASE_URL_UNREACHABLE_CODE = "ollama_base_url_unreachable"
OLLAMA_PROXY_ENV_KEYS = (
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
)


@lru_cache(maxsize=1)
def _load_ollama_sdk_without_proxy_env():
    """Lazily import the Ollama SDK without inheriting proxy env vars during import."""
    preserved_env = {key: os.environ.pop(key) for key in OLLAMA_PROXY_ENV_KEYS if key in os.environ}
    try:
        from ollama import Client as OllamaClient
        from ollama import RequestError as OllamaRequestError
    finally:
        os.environ.update(preserved_env)
    return OllamaClient, OllamaRequestError


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
    if _is_ollama_request_error(exc):
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


def _is_ollama_request_error(exc: Exception) -> bool:
    _, request_error_type = _load_ollama_sdk_without_proxy_env()
    return isinstance(exc, request_error_type)


def _message_content(response: Any) -> str:
    message = safe_getattr(response, "message")
    if message is None and isinstance(response, dict):
        message = response.get("message")
    content = safe_getattr(message, "content")
    if isinstance(content, str):
        return content
    fallback = safe_getattr(response, "response")
    return fallback if isinstance(fallback, str) else ""


def _usage_to_dict(response: Any) -> dict[str, Any] | None:
    eval_count = safe_getattr(response, "eval_count")
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


def _ollama_capabilities(response: Any) -> set[str] | None:
    capabilities = safe_getattr(response, "capabilities")
    if isinstance(capabilities, str):
        normalized = capabilities.strip().lower()
        return {normalized} if normalized else set()
    if not isinstance(capabilities, (list, tuple, set)):
        return None
    return {str(item).strip().lower() for item in capabilities if str(item).strip()}


def _missing_ollama_capabilities(
    response: Any,
    requirements: dict[str, tuple[str, ...]],
) -> list[str]:
    capabilities = _ollama_capabilities(response)
    if capabilities is None:
        return []
    return [
        name
        for name, aliases in requirements.items()
        if not any(alias in capabilities for alias in aliases)
    ]


class _OllamaClientMixin:
    def __init__(self, client_factory=None) -> None:
        self.client_factory = client_factory
        self._client_cache: dict[tuple[str, float], Any] = {}

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _host(self, settings: ProviderSettings) -> str:
        return normalize_ollama_base_url(settings.provider_profiles.ollama.base_url) or (
            "http://host.docker.internal:11434"
        )

    def _client(self, settings: ProviderSettings):
        host = self._host(settings)
        timeout = self._request_timeout(settings)
        cache_key = (host, timeout)
        client = self._client_cache.get(cache_key)
        if client is None:
            client_factory = self.client_factory
            if client_factory is None:
                client_factory, _ = _load_ollama_sdk_without_proxy_env()
            client = client_factory(host=host, timeout=timeout, trust_env=False)
            self._client_cache[cache_key] = client
        return client

    def _quick_model_check(self, settings: ProviderSettings, model: str) -> Any:
        return self._client(settings).show(model)

    def _health_check(
        self,
        settings: ProviderSettings,
        model: str,
        *,
        required_capabilities: dict[str, tuple[str, ...]] | None = None,
    ) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            show_result = self._quick_model_check(settings, model)
        except Exception as exc:  # noqa: BLE001
            return _ollama_failure_message(
                exc,
                host=self._host(settings),
                model=model,
            )
        if required_capabilities is not None:
            missing_capabilities = _missing_ollama_capabilities(show_result, required_capabilities)
            if missing_capabilities:
                return ProviderHealthResult(
                    healthy=False,
                    message=(
                        f"Ollama model {model} does not support required capabilities: "
                        f"{', '.join(missing_capabilities)}."
                    ),
                )
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )

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
                if safe_getattr(chunk, "done") is True:
                    yield ResponseStreamChunk(
                        type="completed",
                        usage=_usage_to_dict(chunk),
                        raw=_raw_dict(chunk),
                    )
                    return
        except Exception as exc:  # noqa: BLE001
            yield ResponseStreamChunk(type="error", error_message=str(exc))

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        return self._health_check(
            settings,
            settings.response_route.model,
            required_capabilities={"completion": ("completion",)},
        )


class OllamaEmbeddingAdapter(_OllamaClientMixin, BaseEmbeddingAdapter):
    """Ollama embedding 适配器。"""

    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        response = self._client(settings).embed(model=settings.embedding_route.model, input=texts)
        embeddings = safe_getattr(response, "embeddings")
        if isinstance(embeddings, list):
            return embeddings
        if embeddings is not None:
            return list(embeddings)
        return []

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        return self._health_check(
            settings,
            settings.embedding_route.model,
            required_capabilities={"embedding": ("embedding", "embeddings")},
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
        return self._health_check(
            settings,
            settings.vision_route.model,
            required_capabilities={
                "completion": ("completion",),
                "vision": ("vision",),
            },
        )
