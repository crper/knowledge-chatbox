"""Build runtime chat settings derived from the active session."""

from __future__ import annotations

from knowledge_chatbox_api.schemas._validators import ReasoningModeLiteral
from knowledge_chatbox_api.schemas.settings import (
    ProviderRuntimeSettings,
    build_provider_runtime_settings,
)


def build_chat_runtime_settings(
    settings_record,
    *,
    reasoning_mode: ReasoningModeLiteral,
) -> ProviderRuntimeSettings:
    """从设置记录构造聊天运行时所需的 provider 配置。"""
    return build_provider_runtime_settings(
        settings_record,
        reasoning_mode=reasoning_mode,
    )
