"""设置与 provider 相关的共享工具函数。"""

from __future__ import annotations

from typing import Any

from knowledge_chatbox_api.providers.base import ProviderHealthResult
from knowledge_chatbox_api.schemas.settings import CapabilityHealthRead


def _settings_attr(value: Any, name: str, default: Any = None) -> Any:
    """从 dict 或对象上安全获取属性。"""
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def get_response_route_info(settings) -> tuple[str, str, str]:
    """从 settings 中提取 response route 的 provider、model 和 reasoning_mode。"""
    route = _settings_attr(settings, "response_route", None)
    provider = _settings_attr(route, "provider", "openai")
    model = _settings_attr(route, "model", "unknown")
    reasoning_mode = _settings_attr(settings, "reasoning_mode", "default")
    return (
        provider if isinstance(provider, str) else "openai",
        model if isinstance(model, str) else "unknown",
        reasoning_mode if isinstance(reasoning_mode, str) else "default",
    )


def to_capability_health(
    result: ProviderHealthResult,
    route: Any,
) -> CapabilityHealthRead:
    """把 provider 健康检查结果映射为 API 响应。"""
    return CapabilityHealthRead(
        provider=_settings_attr(route, "provider", "unknown"),
        model=_settings_attr(route, "model", "unknown"),
        healthy=result.healthy,
        message=result.message,
        latency_ms=result.latency_ms,
    )
