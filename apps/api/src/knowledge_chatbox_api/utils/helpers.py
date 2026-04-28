"""通用工具函数。

提供字符串处理和密钥解包等基础功能。
"""

from pydantic import SecretStr


def strip_or_none(value: str | None) -> str | None:
    """去除字符串首尾空白，空字符串转为 None。"""
    return (value.strip() or None) if value else None


def unwrap_secret(value: SecretStr | str | None) -> str | None:
    """解包密钥值，支持 Pydantic SecretStr 和普通字符串。

    Args:
        value: 可能包含密钥的对象

    Returns:
        解包后的密钥字符串，或 None（当输入无效时）

    Example:
        >>> unwrap_secret("secret_key")
        'secret_key'
        >>> unwrap_secret(None)
        None
    """
    if value is None:
        return None
    if isinstance(value, SecretStr):
        secret = value.get_secret_value()
        return secret if secret else None
    if value:
        return value
    return None
