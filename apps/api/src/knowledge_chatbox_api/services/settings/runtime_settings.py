"""Runtime settings contract for provider-facing service code."""

from typing import Any

from knowledge_chatbox_api.models.enums import ProviderName, ReasoningMode
from knowledge_chatbox_api.schemas._validators import ReasoningModeLiteral
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderRuntimeSettings,
    parse_embedding_route,
    parse_provider_profiles,
    parse_provider_runtime_settings,
    parse_response_route,
    parse_vision_route,
)
from knowledge_chatbox_api.utils.helpers import safe_getattr

DEFAULT_RESPONSE_ROUTE = {"provider": ProviderName.OLLAMA, "model": "unknown"}
DEFAULT_EMBEDDING_ROUTE = {"provider": ProviderName.OLLAMA, "model": "unknown"}
DEFAULT_VISION_ROUTE = {"provider": ProviderName.OLLAMA, "model": "unknown"}
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 60


def _runtime_settings_payload(
    value: Any,
    *,
    embedding_route: EmbeddingRouteConfig | dict[str, Any] | None = None,
    reasoning_mode: ReasoningModeLiteral | None = None,
) -> dict[str, Any]:
    payload = {
        "provider_profiles": parse_provider_profiles(safe_getattr(value, "provider_profiles", {})),
        "response_route": parse_response_route(
            safe_getattr(value, "response_route", DEFAULT_RESPONSE_ROUTE)
        ),
        "embedding_route": parse_embedding_route(
            embedding_route
            if embedding_route is not None
            else safe_getattr(value, "embedding_route", DEFAULT_EMBEDDING_ROUTE)
        ),
        "vision_route": parse_vision_route(
            safe_getattr(value, "vision_route", DEFAULT_VISION_ROUTE)
        ),
        "system_prompt": safe_getattr(value, "system_prompt", None),
        "provider_timeout_seconds": safe_getattr(
            value,
            "provider_timeout_seconds",
            DEFAULT_PROVIDER_TIMEOUT_SECONDS,
        ),
        "active_index_generation": safe_getattr(value, "active_index_generation", None),
    }
    if reasoning_mode is not None:
        payload["reasoning_mode"] = reasoning_mode
    return payload


def parse_runtime_settings(value: object) -> ProviderRuntimeSettings:
    """收紧任意 runtime settings 输入为统一强类型模型。"""
    try:
        return parse_provider_runtime_settings(value)
    except Exception:
        return ProviderRuntimeSettings(
            **_runtime_settings_payload(
                value,
                reasoning_mode=safe_getattr(value, "reasoning_mode", ReasoningMode.DEFAULT),
            )
        )


def build_runtime_settings(
    settings_source: Any,
    *,
    embedding_route: EmbeddingRouteConfig | dict[str, Any] | None = None,
    reasoning_mode: ReasoningModeLiteral = ReasoningMode.DEFAULT,
) -> ProviderRuntimeSettings:
    """从 settings-like 对象构造 provider 运行时所需的统一配置。"""
    return ProviderRuntimeSettings(
        **_runtime_settings_payload(
            settings_source,
            embedding_route=embedding_route,
            reasoning_mode=reasoning_mode,
        )
    )


def build_embedding_settings(settings_record, *, use_pending: bool) -> ProviderRuntimeSettings:
    """根据 pending 标志选择 embedding route 并构建运行时设置。"""
    return build_runtime_settings(
        settings_record,
        embedding_route=(
            settings_record.pending_embedding_route
            if use_pending
            else settings_record.embedding_route
        ),
    )
