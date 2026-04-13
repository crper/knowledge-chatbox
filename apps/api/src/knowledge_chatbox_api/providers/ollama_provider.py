"""Ollama capability adapters."""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from time import perf_counter
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.providers.base import (
    DEFAULT_VISION_PROMPT,
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
)
from knowledge_chatbox_api.providers.ollama_url import normalize_ollama_base_url
from knowledge_chatbox_api.schemas.chat import UsageData
from knowledge_chatbox_api.utils.timing import elapsed_ms

if TYPE_CHECKING:
    from collections.abc import Generator

OLLAMA_BASE_URL_UNREACHABLE_CODE = "ollama_base_url_unreachable"
OLLAMA_PROXY_ENV_KEYS = (
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
)
logger = get_logger(__name__)


class _OllamaMessage(BaseModel):
    """Ollama chat 响应中的 message 字段。"""

    model_config = ConfigDict(extra="allow")

    content: str | None = None


class _OllamaChatResponse(BaseModel):
    """Ollama chat 非流式响应。"""

    model_config = ConfigDict(extra="allow")

    message: _OllamaMessage = Field(default_factory=_OllamaMessage)
    response: str | None = None
    eval_count: int | None = None
    prompt_eval_count: int | None = None
    done: bool | None = None


class _OllamaStreamChunk(BaseModel):
    """Ollama chat 流式分片。"""

    model_config = ConfigDict(extra="allow")

    message: _OllamaMessage = Field(default_factory=_OllamaMessage)
    response: str | None = None
    eval_count: int | None = None
    prompt_eval_count: int | None = None
    done: bool | None = None


class _OllamaShowResponse(BaseModel):
    """Ollama show 响应。"""

    model_config = ConfigDict(extra="allow")

    capabilities: list[str] | str | None = None


class _OllamaEmbedResponse(BaseModel):
    """Ollama embed 响应。"""

    model_config = ConfigDict(extra="allow")

    embeddings: list[list[float]] = Field(default_factory=list)


_CHAT_RESPONSE_ADAPTER = TypeAdapter(_OllamaChatResponse)
_STREAM_CHUNK_ADAPTER = TypeAdapter(_OllamaStreamChunk)
_SHOW_RESPONSE_ADAPTER = TypeAdapter(_OllamaShowResponse)
_EMBED_RESPONSE_ADAPTER = TypeAdapter(_OllamaEmbedResponse)


def _to_dict(value: Any) -> dict[str, Any]:
    """将 Ollama SDK 响应统一转为 dict，消除 dict/object 双路径。"""
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dict__"):
        return {k: v for k, v in vars(value).items() if not k.startswith("_")}
    return {}


@lru_cache(maxsize=1)
def _load_ollama_sdk_without_proxy_env():
    """延迟导入 Ollama SDK，导入期间临时移除代理环境变量。

    lru_cache 保证只执行一次。导入期间短暂修改全局 ``os.environ``，
    因此 **不是线程安全的**——应在应用启动阶段（单线程）预先调用此函数，
    避免在并发请求中首次触发。
    """
    import importlib

    preserved = {}
    for key in OLLAMA_PROXY_ENV_KEYS:
        if key in os.environ:
            preserved[key] = os.environ.pop(key)
    try:
        ollama_mod = importlib.import_module("ollama")
        OllamaClient = ollama_mod.Client  # noqa: N806
        OllamaRequestError = ollama_mod.RequestError  # noqa: N806
    finally:
        os.environ.update(preserved)
    return OllamaClient, OllamaRequestError


class _OllamaClientMixin(ClientCacheMixin):
    def __init__(self, client_factory: type | None = None) -> None:
        super().__init__()
        self.client_factory = client_factory

    @staticmethod
    def _status_code(exc: Exception) -> int | None:
        status_code = getattr(exc, "status_code", None)
        return status_code if isinstance(status_code, int) else None

    @staticmethod
    def _is_request_error(exc: Exception) -> bool:
        _, request_error_type = _load_ollama_sdk_without_proxy_env()
        return isinstance(exc, request_error_type)

    def _failure_message(
        self,
        exc: Exception,
        *,
        host: str,
        model: str | None = None,
    ) -> ProviderHealthResult:
        status_code = self._status_code(exc)
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
        if self._is_request_error(exc):
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

    @staticmethod
    def _extract_message_content(response: Any) -> str:
        parsed = _CHAT_RESPONSE_ADAPTER.validate_python(_to_dict(response))
        if parsed.message.content is not None:
            return parsed.message.content
        if parsed.response is not None:
            return parsed.response
        return ""

    @staticmethod
    def _extract_usage_data(response: Any) -> UsageData | None:
        parsed = _CHAT_RESPONSE_ADAPTER.validate_python(_to_dict(response))
        if parsed.eval_count is None and parsed.prompt_eval_count is None:
            return None
        data: dict[str, Any] = {}
        if parsed.prompt_eval_count is not None:
            data["input_tokens"] = parsed.prompt_eval_count
        if parsed.eval_count is not None:
            data["output_tokens"] = parsed.eval_count
        return UsageData.model_validate(data)

    @staticmethod
    def _to_raw_dict(response: Any) -> dict[str, Any] | None:
        if response is None:
            return None
        return _to_dict(response) or None

    @staticmethod
    def _parse_capabilities(response: Any) -> set[str] | None:
        parsed = _SHOW_RESPONSE_ADAPTER.validate_python(_to_dict(response))
        capabilities = parsed.capabilities
        if capabilities is None:
            return None
        if isinstance(capabilities, str):
            normalized = capabilities.strip().lower()
            return {normalized} if normalized else set()
        return {str(item).strip().lower() for item in capabilities if str(item).strip()}

    def _check_missing_capabilities(
        self,
        response: Any,
        requirements: dict[str, tuple[str, ...]],
    ) -> list[str]:
        capabilities = self._parse_capabilities(response)
        if capabilities is None:
            return []
        return [
            name
            for name, aliases in requirements.items()
            if not any(alias in capabilities for alias in aliases)
        ]

    def _host(self, settings: ProviderSettings) -> str:
        return (
            normalize_ollama_base_url(settings.provider_profiles.ollama.base_url)
            or "http://host.docker.internal:11434"
        )

    def _client(self, settings: ProviderSettings) -> Any:
        host = self._host(settings)
        timeout = float(settings.provider_timeout_seconds)
        cache_key = (host, timeout)

        def create_client():
            resolved_factory = self.client_factory
            if resolved_factory is None:
                resolved_factory, _ = _load_ollama_sdk_without_proxy_env()
            return resolved_factory(host=host, timeout=timeout, trust_env=False)

        return self._get_or_create_client(cache_key, create_client)

    def _health_check(
        self,
        settings: ProviderSettings,
        model: str,
        *,
        required_capabilities: dict[str, tuple[str, ...]] | None = None,
    ) -> ProviderHealthResult:
        start = perf_counter()
        try:
            show_result = self._client(settings).show(model)
        except Exception as exc:
            return self._failure_message(
                exc,
                host=self._host(settings),
                model=model,
            )
        if required_capabilities is not None:
            missing = self._check_missing_capabilities(
                show_result,
                required_capabilities,
            )
            if missing:
                return ProviderHealthResult(
                    healthy=False,
                    message=(
                        f"Ollama model {model} does not support required capabilities: "
                        f"{', '.join(missing)}."
                    ),
                )
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=elapsed_ms(start),
        )

    def _think_config(self, settings: ResponseRuntimeSettings) -> bool:
        config = build_reasoning_config(ProviderName.OLLAMA, settings.reasoning_mode)
        return config.get("extra_body", {}).get("think", False)

    def _serialize_messages(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        serialized_messages: list[dict[str, Any]] = []
        for message in messages:
            parts = extract_content_parts(message.get("content"))
            payload: dict[str, Any] = {
                "role": message.get("role"),
                "content": "\n\n".join(part for part in parts.text_parts if part),
            }
            if parts.image_parts:
                payload["images"] = [img.data_base64 for img in parts.image_parts]
            serialized_messages.append(payload)

        return serialized_messages


class OllamaResponseAdapter(_OllamaClientMixin):
    """Ollama 聊天适配器。"""

    @provider_retry
    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        response = self._client(settings).chat(
            model=settings.response_route.model,
            messages=self._serialize_messages(messages),
            stream=False,
            think=self._think_config(settings),
        )
        return self._extract_message_content(response)

    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ) -> Generator[ResponseStreamChunk]:
        try:
            stream = self._client(settings).chat(
                model=settings.response_route.model,
                messages=self._serialize_messages(messages),
                stream=True,
                think=self._think_config(settings),
            )
            for chunk in stream:
                parsed = _STREAM_CHUNK_ADAPTER.validate_python(_to_dict(chunk))
                content = parsed.message.content or parsed.response or ""
                if content:
                    yield ResponseStreamChunk(
                        type="text_delta",
                        delta=content,
                        raw=self._to_raw_dict(chunk),
                    )
                if parsed.done is True:
                    yield ResponseStreamChunk(
                        type="completed",
                        usage=self._extract_usage_data(chunk),
                        raw=self._to_raw_dict(chunk),
                    )
                    return
        except Exception as exc:
            logger.warning("ollama_stream_error", error_message=str(exc), exc_info=True)
            yield ResponseStreamChunk(type="error", error_message="Provider stream error.")

    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        return self._health_check(
            settings,
            settings.response_route.model,
            required_capabilities={"completion": ("completion",)},
        )


class OllamaEmbeddingAdapter(_OllamaClientMixin):
    """Ollama embedding 适配器。"""

    @provider_retry
    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        response = self._client(settings).embed(model=settings.embedding_route.model, input=texts)
        parsed = _EMBED_RESPONSE_ADAPTER.validate_python(_to_dict(response))
        return parsed.embeddings

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        return self._health_check(
            settings,
            settings.embedding_route.model,
            required_capabilities={"embedding": ("embedding", "embeddings")},
        )


class OllamaVisionAdapter(_OllamaClientMixin):
    """Ollama vision 适配器。"""

    supports_vision = True

    @provider_retry
    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        encoded_images = [
            base64.b64encode(item.get("bytes", b"")).decode("utf-8") for item in inputs
        ]
        response = self._client(settings).chat(
            model=settings.vision_route.model,
            messages=[
                {
                    "role": "user",
                    "content": DEFAULT_VISION_PROMPT,
                    "images": encoded_images,
                }
            ],
            stream=False,
            think=False,
        )
        return self._extract_message_content(response)

    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        return self._health_check(
            settings,
            settings.vision_route.model,
            required_capabilities={
                "completion": ("completion",),
                "vision": ("vision",),
            },
        )
