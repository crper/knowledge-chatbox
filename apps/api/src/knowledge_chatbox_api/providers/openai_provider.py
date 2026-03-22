"""OpenAI capability adapters."""

from __future__ import annotations

import base64
import time
from typing import Any, cast
from urllib.parse import urlsplit, urlunsplit

from openai import NOT_GIVEN

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

DEFAULT_MAX_OUTPUT_TOKENS = 4096
OPENAI_MODEL_NOT_AVAILABLE_CODE = "openai_model_not_available"
OPENAI_INVALID_API_KEY_CODE = "openai_invalid_api_key"


class OpenAIModelNotAvailableError(Exception):
    """Raised when the requested model does not appear in the provider list."""

    def __init__(self, model: str) -> None:
        super().__init__(f"OpenAI model {model} is not available.")
        self.model = model


class OpenAIInvalidApiKeyError(Exception):
    """Raised when the gateway rejects the provided API key."""

    def __init__(self) -> None:
        super().__init__("OpenAI API key is invalid or rejected by the gateway.")


class _OpenAIClientMixin:
    def __init__(self, client_factory=None) -> None:
        self.client_factory = client_factory
        self._client_cache: dict[tuple[str | None, str | None, float | object], Any] = {}

    def _normalize_base_url(self, base_url: str | None) -> str | None:
        if not base_url:
            return None

        parsed = urlsplit(base_url.strip())
        if not parsed.scheme or not parsed.netloc:
            return base_url.strip().rstrip("/") or None

        normalized_path = parsed.path.rstrip("/") or "/v1"
        return urlunsplit(
            (parsed.scheme, parsed.netloc, normalized_path, parsed.query, parsed.fragment)
        )

    def _client(self, settings: ProviderSettings):
        from openai import OpenAI

        profile = settings.provider_profiles.openai
        factory = self.client_factory or OpenAI
        timeout = settings.provider_timeout_seconds
        client_timeout = float(timeout) if timeout else NOT_GIVEN
        normalized_base_url = self._normalize_base_url(profile.base_url)
        cache_key = (profile.api_key, normalized_base_url, client_timeout)
        cached = self._client_cache.get(cache_key)
        if cached is not None:
            return cached

        kwargs = {"api_key": profile.api_key, "timeout": client_timeout}
        if normalized_base_url:
            kwargs["base_url"] = normalized_base_url

        client = factory(**kwargs)
        self._client_cache[cache_key] = client
        return client

    def _api_key(self, settings: ProviderSettings) -> str | None:
        return settings.provider_profiles.openai.api_key

    def _model_exists_in_list(self, models_response: Any, model: str) -> bool:
        data = getattr(models_response, "data", models_response)
        if isinstance(data, dict):
            data = data.get("data", [])

        try:
            items = list(data)
        except TypeError:
            return True

        for item in items:
            candidate = getattr(item, "id", None)
            if candidate is None and isinstance(item, dict):
                candidate = item.get("id")
            if candidate == model:
                return True
        return False

    def _is_not_found_error(self, exc: Exception) -> bool:
        status_code = getattr(exc, "status_code", None)
        if status_code in {404, 405, 501}:
            return True

        response = getattr(exc, "response", None)
        if getattr(response, "status_code", None) in {404, 405, 501}:
            return True

        message = str(exc).lower()
        return "404" in message or "not found" in message

    def _is_auth_error(self, exc: Exception) -> bool:
        status_code = getattr(exc, "status_code", None)
        if status_code in {401, 403}:
            return True

        response = getattr(exc, "response", None)
        if getattr(response, "status_code", None) in {401, 403}:
            return True

        code = getattr(exc, "code", None)
        if isinstance(code, str) and code.upper() in {
            "INVALID_API_KEY",
            "UNAUTHORIZED",
            "AUTHENTICATION_ERROR",
        }:
            return True

        body = getattr(exc, "body", None)
        if isinstance(body, dict):
            body_code = body.get("code")
            if isinstance(body_code, str) and body_code.upper() in {
                "INVALID_API_KEY",
                "UNAUTHORIZED",
                "AUTHENTICATION_ERROR",
            }:
                return True

        message = str(exc).lower()
        return "invalid api key" in message or "unauthorized" in message

    def _quick_model_check(self, settings: ProviderSettings, model: str) -> None:
        client = self._client(settings)
        try:
            client.models.retrieve(model)
            return
        except Exception as exc:  # noqa: BLE001
            if self._is_auth_error(exc):
                raise OpenAIInvalidApiKeyError() from exc
            if not self._is_not_found_error(exc):
                raise

        # Some OpenAI-compatible gateways expose /v1/models but not /v1/models/{id}.
        models_response = client.models.list()
        if self._model_exists_in_list(models_response, model):
            return

        raise OpenAIModelNotAvailableError(model)

    def _reasoning_config(self, settings: ResponseRuntimeSettings) -> Any:
        mode = settings.reasoning_mode
        if mode == "on":
            return {"effort": "medium"}
        if mode == "off":
            return {"effort": "none"}
        return NOT_GIVEN

    def _serialize_response_input(self, messages: list[dict[str, Any]]) -> Any:
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

            serialized_content: list[dict[str, Any]] = []
            for item in content:
                if item.get("type") == "text":
                    serialized_content.append({"type": "input_text", "text": item.get("text", "")})
                elif item.get("type") == "image":
                    serialized_content.append(
                        {
                            "type": "input_image",
                            "image_url": (
                                f"data:{item.get('mime_type', 'image/jpeg')};base64,"
                                f"{item.get('data_base64', '')}"
                            ),
                            "detail": "auto",
                        }
                    )

            serialized_messages.append(
                {
                    "role": message.get("role"),
                    "content": serialized_content,
                }
            )

        return serialized_messages


class OpenAIResponseAdapter(_OpenAIClientMixin, BaseResponseAdapter):
    """OpenAI Responses API 适配器。"""

    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        client = self._client(settings)
        response = client.responses.create(
            model=settings.response_route.model,
            input=cast(Any, self._serialize_response_input(messages)),
            max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
            reasoning=cast(Any, self._reasoning_config(settings)),
        )
        return getattr(response, "output_text", "") or ""

    def stream_response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings):
        client = self._client(settings)

        try:
            with client.responses.stream(
                model=settings.response_route.model,
                input=cast(Any, self._serialize_response_input(messages)),
                max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
                reasoning=cast(Any, self._reasoning_config(settings)),
            ) as stream:
                response_id: str | None = None
                usage: dict[str, Any] | None = None
                for event in stream:
                    response_id = getattr(event, "response_id", response_id)
                    event_type = getattr(event, "type", None)
                    if event_type == "response.output_text.delta":
                        yield ResponseStreamChunk(
                            type="text_delta",
                            delta=getattr(event, "delta", ""),
                            provider_response_id=response_id,
                        )
                    elif event_type == "response.completed":
                        usage = getattr(getattr(event, "response", None), "usage", None)
                        model_dump = getattr(usage, "model_dump", None)
                        usage_payload = model_dump() if callable(model_dump) else usage
                        yield ResponseStreamChunk(
                            type="completed",
                            provider_response_id=response_id,
                            usage=cast(Any, usage_payload),
                        )
        except Exception as exc:  # noqa: BLE001
            yield ResponseStreamChunk(type="error", error_message=str(exc))

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            if not self._api_key(settings):
                return ProviderHealthResult(healthy=False, message="OpenAI API key is missing.")
            self._quick_model_check(settings, settings.response_route.model)
        except OpenAIInvalidApiKeyError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_INVALID_API_KEY_CODE,
                message=str(exc),
            )
        except OpenAIModelNotAvailableError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_MODEL_NOT_AVAILABLE_CODE,
                message=str(exc),
            )
        except Exception as exc:  # noqa: BLE001
            return ProviderHealthResult(healthy=False, message=str(exc))

        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )


class OpenAIEmbeddingAdapter(_OpenAIClientMixin, BaseEmbeddingAdapter):
    """OpenAI embedding 适配器。"""

    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        client = self._client(settings)
        response = client.embeddings.create(model=settings.embedding_route.model, input=texts)
        return [item.embedding for item in response.data]

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            if not self._api_key(settings):
                return ProviderHealthResult(healthy=False, message="OpenAI API key is missing.")
            self._quick_model_check(settings, settings.embedding_route.model)
        except OpenAIInvalidApiKeyError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_INVALID_API_KEY_CODE,
                message=str(exc),
            )
        except OpenAIModelNotAvailableError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_MODEL_NOT_AVAILABLE_CODE,
                message=str(exc),
            )
        except Exception as exc:  # noqa: BLE001
            return ProviderHealthResult(healthy=False, message=str(exc))
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )


class OpenAIVisionAdapter(_OpenAIClientMixin, BaseVisionAdapter):
    """OpenAI vision 适配器。"""

    supports_vision = True

    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        client = self._client(settings)
        response = client.responses.create(
            model=settings.vision_route.model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Describe the image content in markdown."},
                        *[
                            {
                                "type": "input_image",
                                "image_url": (
                                    f"data:{item.get('mime_type', 'image/jpeg')};base64,"
                                    f"{base64.b64encode(item.get('bytes', b'')).decode('utf-8')}"
                                ),
                                "detail": "auto",
                            }
                            for item in inputs
                        ],
                    ],
                }
            ],
            max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
        )
        return getattr(response, "output_text", "") or ""

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        start = time.perf_counter()
        try:
            if not self._api_key(settings):
                return ProviderHealthResult(healthy=False, message="OpenAI API key is missing.")
            self._quick_model_check(settings, settings.vision_route.model)
        except OpenAIInvalidApiKeyError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_INVALID_API_KEY_CODE,
                message=str(exc),
            )
        except OpenAIModelNotAvailableError as exc:
            return ProviderHealthResult(
                healthy=False,
                code=OPENAI_MODEL_NOT_AVAILABLE_CODE,
                message=str(exc),
            )
        except Exception as exc:  # noqa: BLE001
            return ProviderHealthResult(healthy=False, message=str(exc))
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
