"""Anthropic capability adapters."""

from __future__ import annotations

import base64
from typing import TYPE_CHECKING, Any

from anthropic import Anthropic

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.enums import ChatMessageRole
from knowledge_chatbox_api.providers.base import (
    DEFAULT_VISION_PROMPT,
    ClientCacheMixin,
    ProviderHealthResult,
    ProviderName,
    ProviderSettings,
    ResponseAdapterProtocol,
    ResponseRuntimeSettings,
    ResponseSettings,
    ResponseStreamChunk,
    VisionAdapterProtocol,
    VisionSettings,
    build_reasoning_config,
    provider_retry,
    transform_content,
)
from knowledge_chatbox_api.providers.ollama_url import normalize_provider_base_url
from knowledge_chatbox_api.schemas.chat import UsageData

DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
DEFAULT_MAX_TOKENS = 4096
logger = get_logger(__name__)

if TYPE_CHECKING:
    from collections.abc import Callable, Generator


def _to_usage_data(usage: Any) -> UsageData | None:
    if usage is None:
        return None
    if hasattr(usage, "model_dump"):
        return UsageData.model_validate(usage.model_dump())
    data: dict[str, Any] = {}
    for field in (
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ):
        value = getattr(usage, field, None)
        if value is not None:
            data[field] = value
    return UsageData.model_validate(data) if data else None


class _AnthropicClientMixin(ClientCacheMixin):
    def __init__(self, client_factory: Callable[..., Anthropic] | None = None) -> None:
        super().__init__()
        self.client_factory = client_factory or Anthropic

    def _normalize_base_url(self, base_url: str | None) -> str:
        return normalize_provider_base_url(
            base_url, default=DEFAULT_ANTHROPIC_BASE_URL, ensure_v1_suffix=True
        )

    def _api_key(self, settings: ProviderSettings) -> str | None:
        return settings.provider_profiles.anthropic.api_key

    def _client(self, settings: ProviderSettings) -> Anthropic:
        api_key = self._api_key(settings) or ""
        base_url = self._normalize_base_url(settings.provider_profiles.anthropic.base_url)
        timeout = float(settings.provider_timeout_seconds)
        cache_key = (api_key, base_url, timeout)

        def _build_client() -> Anthropic:
            return self.client_factory(api_key=api_key, base_url=base_url, timeout=timeout)

        return self._get_or_create_client(
            cache_key,
            _build_client,
        )

    def _check_model_availability(
        self,
        settings: ProviderSettings,
        model: str,
    ) -> ProviderHealthResult:
        if not self._api_key(settings):
            return ProviderHealthResult(healthy=False, message="Anthropic API key is missing.")
        return self._run_provider_health_check(
            lambda: self._client(settings).models.retrieve(model),
        )

    def _thinking_config(self, settings: ResponseRuntimeSettings) -> dict[str, Any] | None:
        config = build_reasoning_config(ProviderName.ANTHROPIC, settings.reasoning_mode)
        return config.get("anthropic_thinking")

    def _serialize_messages(
        self,
        messages: list[dict[str, Any]],
    ) -> tuple[str | None, list[dict[str, Any]]]:
        system_parts: list[str] = []
        serialized_messages: list[dict[str, Any]] = []

        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role == ChatMessageRole.SYSTEM:
                if isinstance(content, str) and content.strip():
                    system_parts.append(content.strip())
                continue

            normalized_role = (
                ChatMessageRole.ASSISTANT
                if role == ChatMessageRole.ASSISTANT
                else ChatMessageRole.USER
            )
            serialized_messages.append(
                {
                    "role": normalized_role,
                    "content": self._serialize_content_blocks(content),
                }
            )

        system_prompt = "\n\n".join(system_parts).strip() or None
        return system_prompt, serialized_messages

    def _serialize_content_blocks(self, content: Any) -> list[dict[str, Any]]:
        return transform_content(
            content,
            text_fn=lambda t: {"type": "text", "text": t},
            image_fn=lambda img: {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img.mime_type,
                    "data": img.data_base64,
                },
            },
        )

    def _extract_response_text(self, response: Any) -> str:
        return "".join(
            getattr(block, "text", "") or ""
            for block in getattr(response, "content", []) or []
            if getattr(block, "type", None) == "text"
        ).strip()

    def _build_message_kwargs(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        system_prompt: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        thinking_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system_prompt:
            payload["system"] = system_prompt
        if thinking_config is not None:
            payload["thinking"] = thinking_config
        return payload


class AnthropicResponseAdapter(_AnthropicClientMixin, ResponseAdapterProtocol):
    """Anthropic Messages API 适配器。"""

    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        system_prompt, serialized_messages = self._serialize_messages(messages)
        response = self._client(settings).messages.create(
            **self._build_message_kwargs(
                model=settings.response_route.model,
                messages=serialized_messages,
                system_prompt=system_prompt,
                thinking_config=self._thinking_config(settings),
            )
        )
        return self._extract_response_text(response)

    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ) -> Generator[ResponseStreamChunk]:
        system_prompt, serialized_messages = self._serialize_messages(messages)
        try:
            with self._client(settings).messages.stream(
                **self._build_message_kwargs(
                    model=settings.response_route.model,
                    messages=serialized_messages,
                    system_prompt=system_prompt,
                    thinking_config=self._thinking_config(settings),
                )
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        yield ResponseStreamChunk(type="text_delta", delta=text)

                final_message = stream.get_final_message()
                yield ResponseStreamChunk(
                    type="completed",
                    provider_response_id=getattr(final_message, "id", None),
                    usage=_to_usage_data(getattr(final_message, "usage", None)),
                )
        except Exception as exc:
            logger.warning("anthropic_stream_error", error_message=str(exc), exc_info=True)
            yield ResponseStreamChunk(type="error", error_message="Provider stream error.")

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        return self._check_model_availability(settings, settings.response_route.model)


class AnthropicVisionAdapter(_AnthropicClientMixin, VisionAdapterProtocol):
    """Anthropic vision 适配器。"""

    supports_vision = True

    @provider_retry
    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        response = self._client(settings).messages.create(
            model=settings.vision_route.model,
            max_tokens=DEFAULT_MAX_TOKENS,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": DEFAULT_VISION_PROMPT},
                        *[
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": item.get("mime_type", "image/jpeg"),
                                    "data": base64.b64encode(item.get("bytes", b"")).decode(
                                        "utf-8"
                                    ),
                                },
                            }
                            for item in inputs
                        ],
                    ],
                }
            ],
        )
        return self._extract_response_text(response)

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        return self._check_model_availability(settings, settings.vision_route.model)
