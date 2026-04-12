"""OpenAI capability adapters."""

from __future__ import annotations

import base64
from time import perf_counter
from typing import TYPE_CHECKING, Any, cast

from openai import NOT_GIVEN, OpenAI

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.providers.base import (
    DEFAULT_VISION_PROMPT,
    BaseEmbeddingAdapter,
    BaseResponseAdapter,
    BaseVisionAdapter,
    ClientCacheMixin,
    EmbeddingSettings,
    ProviderHealthResult,
    ProviderName,
    ProviderSettings,
    ResponseRuntimeSettings,
    ResponseSettings,
    ResponseStreamChunk,
    VisionSettings,
    build_reasoning_config,
    extract_content_parts,
    provider_retry,
    transform_content,
)
from knowledge_chatbox_api.providers.ollama_url import normalize_provider_base_url
from knowledge_chatbox_api.utils.helpers import safe_getattr
from knowledge_chatbox_api.utils.timing import elapsed_ms

if TYPE_CHECKING:
    import collections.abc
    from collections.abc import Callable

    from openai.types.responses import ResponseInputParam

DEFAULT_MAX_OUTPUT_TOKENS = 4096
OPENAI_MODEL_NOT_AVAILABLE_CODE = "openai_model_not_available"
OPENAI_INVALID_API_KEY_CODE = "openai_invalid_api_key"
logger = get_logger(__name__)


class OpenAIModelNotAvailableError(Exception):
    """Raised when the requested model does not appear in the provider list."""

    def __init__(self, model: str) -> None:
        super().__init__(f"OpenAI model {model} is not available.")
        self.model = model


class OpenAIInvalidApiKeyError(Exception):
    """Raised when the gateway rejects the provided API key."""

    def __init__(self) -> None:
        super().__init__("OpenAI API key is invalid or rejected by the gateway.")


class _OpenAIClientMixin(ClientCacheMixin):
    def __init__(self, client_factory: Callable[..., Any] | None = None) -> None:
        super().__init__()
        self._client_factory: Callable[..., Any] = client_factory or OpenAI

    def _normalize_base_url(self, base_url: str | None) -> str | None:
        return normalize_provider_base_url(
            base_url,
            ensure_v1_suffix=True,
            preserve_existing_path=True,
        )

    def _client(self, settings: ProviderSettings) -> OpenAI:
        profile = settings.provider_profiles.openai
        factory = self._client_factory
        timeout = settings.provider_timeout_seconds
        client_timeout = float(timeout) if timeout else NOT_GIVEN
        normalized_base_url = self._normalize_base_url(profile.base_url)
        cache_key = (profile.api_key, normalized_base_url, client_timeout)

        def create_client() -> OpenAI:
            return factory(
                api_key=profile.api_key,
                timeout=client_timeout,
                base_url=normalized_base_url,
            )

        return self._get_or_create_client(cache_key, create_client)

    def _api_key(self, settings: ProviderSettings) -> str | None:
        return settings.provider_profiles.openai.api_key

    def _model_exists_in_list(self, models_response: Any, model: str) -> bool:
        data = safe_getattr(models_response, "data", models_response)
        if isinstance(data, dict):
            data = data.get("data", [])

        try:
            items = list(data)
        except TypeError:
            return True

        return any(
            (safe_getattr(item, "id", None) or (item.get("id") if isinstance(item, dict) else None))
            == model
            for item in items
        )

    def _is_not_found_error(self, exc: Exception) -> bool:
        from openai import NotFoundError

        if isinstance(exc, NotFoundError):
            return True
        status_code = getattr(exc, "status_code", None)
        if status_code in {404, 405, 501}:
            return True
        response = getattr(exc, "response", None)
        return getattr(response, "status_code", None) in {404, 405, 501}

    def _is_auth_error(self, exc: Exception) -> bool:
        from openai import AuthenticationError

        if isinstance(exc, AuthenticationError):
            return True
        status_code = getattr(exc, "status_code", None)
        if status_code in {401, 403}:
            return True
        response = getattr(exc, "response", None)
        return getattr(response, "status_code", None) in {401, 403}

    def _quick_model_check(self, settings: ProviderSettings, model: str) -> None:
        client = self._client(settings)
        try:
            client.models.retrieve(model)
            return
        except Exception as exc:
            if self._is_auth_error(exc):
                raise OpenAIInvalidApiKeyError() from exc
            if not self._is_not_found_error(exc):
                raise

        # Some OpenAI-compatible gateways expose /v1/models but not /v1/models/{id}.
        models_response = client.models.list()
        if self._model_exists_in_list(models_response, model):
            return

        raise OpenAIModelNotAvailableError(model)

    def _run_health_check(self, settings, model: str) -> ProviderHealthResult:
        start = perf_counter()
        if not self._api_key(settings):
            return ProviderHealthResult(healthy=False, message="OpenAI API key is missing.")
        try:
            self._quick_model_check(settings, model)
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
        except Exception as exc:
            return ProviderHealthResult(healthy=False, message=str(exc))
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=elapsed_ms(start),
        )

    def _reasoning_config(self, settings: ResponseRuntimeSettings) -> dict[str, str] | None:
        config = build_reasoning_config(ProviderName.OPENAI, settings.reasoning_mode)
        effort = config.get("openai_reasoning_effort")
        if effort is not None:
            return {"effort": effort}
        return None

    def _serialize_response_input(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        serialized_messages: list[dict[str, Any]] = []
        for message in messages:
            content = message.get("content")
            parts = extract_content_parts(content)
            if not parts.image_parts:
                serialized_messages.append(
                    {"role": message.get("role"), "content": parts.text_parts[0]}
                )
                continue

            serialized_content = transform_content(
                content,
                text_fn=lambda t: {"type": "input_text", "text": t},
                image_fn=lambda img: {
                    "type": "input_image",
                    "image_url": f"data:{img['mime_type']};base64,{img['data_base64']}",
                    "detail": "auto",
                },
            )
            serialized_messages.append({"role": message.get("role"), "content": serialized_content})

        return serialized_messages


class OpenAIResponseAdapter(_OpenAIClientMixin, BaseResponseAdapter):
    """OpenAI Responses API 适配器。"""

    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        client = self._client(settings)
        response = client.responses.create(
            model=settings.response_route.model,
            input=cast("ResponseInputParam", self._serialize_response_input(messages)),
            max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
            reasoning=cast("Any", self._reasoning_config(settings)),
        )
        return safe_getattr(response, "output_text", "") or ""

    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ) -> collections.abc.Generator[ResponseStreamChunk, None, None]:
        client = self._client(settings)

        try:
            with client.responses.stream(
                model=settings.response_route.model,
                input=cast("ResponseInputParam", self._serialize_response_input(messages)),
                max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
                reasoning=cast("Any", self._reasoning_config(settings)),
            ) as stream:
                response_id: str | None = None
                for event in stream:
                    response_id = safe_getattr(event, "response_id", response_id)
                    event_type = safe_getattr(event, "type")
                    if event_type == "response.output_text.delta":
                        yield ResponseStreamChunk(
                            type="text_delta",
                            delta=safe_getattr(event, "delta", ""),
                            provider_response_id=response_id,
                        )
                    elif event_type == "response.completed":
                        response_obj = safe_getattr(event, "response")
                        usage_obj = safe_getattr(response_obj, "usage") if response_obj else None
                        model_dump = safe_getattr(usage_obj, "model_dump") if usage_obj else None
                        usage_payload: dict[str, Any] | None = None
                        if callable(model_dump):
                            result = model_dump()
                            usage_payload = result if isinstance(result, dict) else None
                        elif isinstance(usage_obj, dict):
                            usage_payload = usage_obj
                        yield ResponseStreamChunk(
                            type="completed",
                            provider_response_id=response_id,
                            usage=usage_payload,
                        )
        except Exception as exc:
            logger.warning("openai_stream_error", error_message=str(exc))
            user_message = "Provider stream error."
            if self._is_auth_error(exc):
                user_message = "Authentication failed. Please check your API key."
            elif self._is_not_found_error(exc):
                user_message = "Requested model is not available."
            yield ResponseStreamChunk(type="error", error_message=user_message)

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        return self._run_health_check(settings, settings.response_route.model)


class OpenAIEmbeddingAdapter(_OpenAIClientMixin, BaseEmbeddingAdapter):
    """OpenAI embedding 适配器。"""

    @provider_retry
    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        client = self._client(settings)
        response = client.embeddings.create(model=settings.embedding_route.model, input=texts)
        return [item.embedding for item in response.data]

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        return self._run_health_check(settings, settings.embedding_route.model)


class OpenAIVisionAdapter(_OpenAIClientMixin, BaseVisionAdapter):
    """OpenAI vision 适配器。"""

    supports_vision = True

    @provider_retry
    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        client = self._client(settings)
        response = client.responses.create(
            model=settings.vision_route.model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": DEFAULT_VISION_PROMPT},
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
        return safe_getattr(response, "output_text", "") or ""

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        return self._run_health_check(settings, settings.vision_route.model)
