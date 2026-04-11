"""通用工具函数。"""

from typing import Any


def safe_getattr(value: Any, name: str, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped: str = value.strip()
    return stripped or None


def unwrap_secret(value: object) -> str | None:
    if value is None:
        return None
    get_secret_value = getattr(value, "get_secret_value", None)
    if callable(get_secret_value):
        secret = get_secret_value()
        return secret if isinstance(secret, str) and secret else None
    if isinstance(value, str) and value:
        return value
    return None
