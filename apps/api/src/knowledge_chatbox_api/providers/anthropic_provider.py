"""Anthropic capability adapters."""

import base64
from time import perf_counter
from typing import Any

from anthropic import Anthropic

from knowledge_chatbox_api.models.enums import ChatMessageRole
from knowledge_chatbox_api.providers.base import (
    DEFAULT_VISION_PROMPT,
    BaseResponseAdapter,
    BaseVisionAdapter,
    ClientCacheMixin,
    ProviderHealthResult,
    ProviderName,
    ProviderSettings,
    ResponseRuntimeSettings,
    ResponseSettings,
    ResponseStreamChunk,
    VisionSettings,
    build_reasoning_config,
    provider_retry,
)
from knowledge_chatbox_api.utils.helpers import safe_getattr
from knowledge_chatbox_api.utils.timing import elapsed_ms

DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
DEFAULT_MAX_TOKENS = 4096


def _usage_to_dict(usage: Any) -> dict[str, Any] | None:
    if usage is None:
        return None
    if hasattr(usage, "model_dump"):
        return usage.model_dump()

    result: dict[str, Any] = {}
    for field in (
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ):
        value = safe_getattr(usage, field)
        if value is not None:
            result[field] = value
    return result or None


class _AnthropicClientMixin(ClientCacheMixin):
    def __init__(self, client_factory=None) -> None:
        super().__init__()
        self.client_factory = client_factory or Anthropic

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _normalize_base_url(self, base_url: str | None) -> str:
        normalized = (base_url or DEFAULT_ANTHROPIC_BASE_URL).strip().rstrip("/")
        if normalized.endswith("/v1"):
            return normalized
        return f"{normalized}/v1"

    def _api_key(self, settings: ProviderSettings) -> str | None:
        return settings.provider_profiles.anthropic.api_key

    def _client(self, settings: ProviderSettings):
        api_key = self._api_key(settings) or ""
        base_url = self._normalize_base_url(settings.provider_profiles.anthropic.base_url)
        timeout = self._request_timeout(settings)
        cache_key = (api_key, base_url, timeout)
        return self._get_or_create_client(
            cache_key,
            lambda: self.client_factory(api_key=api_key, base_url=base_url, timeout=timeout),
        )

    def _quick_model_check(self, settings: ProviderSettings, model: str) -> None:
        self._client(settings).models.retrieve(model)

    def _run_health_check(self, settings: ProviderSettings, model: str) -> ProviderHealthResult:
        start = perf_counter()
        if not self._api_key(settings):
            return ProviderHealthResult(healthy=False, message="Anthropic API key is missing.")

        try:
            self._quick_model_check(settings, model)
        except Exception as exc:  # noqa: BLE001
            return ProviderHealthResult(healthy=False, message=str(exc))
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=elapsed_ms(start),
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
        if isinstance(content, str):
            return [{"type": "text", "text": content}]
        if not isinstance(content, list):
            return [{"type": "text", "text": ""}]

        blocks: list[dict[str, Any]] = []
        for item in content:
            if item.get("type") == "text":
                blocks.append({"type": "text", "text": item.get("text", "")})
            elif item.get("type") == "image":
                blocks.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": item.get("mime_type", "image/jpeg"),
                            "data": item.get("data_base64", ""),
                        },
                    }
                )
        return blocks or [{"type": "text", "text": ""}]

    def _extract_response_text(self, response: Any) -> str:
        parts: list[str] = []
        for block in safe_getattr(response, "content", []) or []:
            if safe_getattr(block, "type") == "text":
                parts.append(safe_getattr(block, "text", "") or "")
        return "".join(parts).strip()

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


class AnthropicResponseAdapter(_AnthropicClientMixin, BaseResponseAdapter):
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

    def stream_response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings):
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
                    provider_response_id=safe_getattr(final_message, "id"),
                    usage=_usage_to_dict(safe_getattr(final_message, "usage")),
                )
        except Exception as exc:  # noqa: BLE001
            yield ResponseStreamChunk(type="error", error_message=str(exc))

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        return self._run_health_check(settings, settings.response_route.model)


class AnthropicVisionAdapter(_AnthropicClientMixin, BaseVisionAdapter):
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
        return self._run_health_check(settings, settings.vision_route.model)
