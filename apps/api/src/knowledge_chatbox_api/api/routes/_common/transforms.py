"""路由层通用转换函数。

提供模型到响应结构的标准化转换工具，减少路由文件中的重复代码。
"""

from pydantic import BaseModel


def model_to_read[ReadT: BaseModel](
    model: object,
    read_class: type[ReadT],
    *,
    extra: dict[str, object] | None = None,
) -> ReadT:
    """通用模型转响应结构函数。

    使用 Pydantic 的 model_validate 进行属性映射，支持额外的字段覆盖。

    Args:
        model: 源模型对象
        read_class: 目标响应结构类
        extra: 额外的字段值，会覆盖模型中的同名属性

    Returns:
        转换后的响应结构对象

    Example:
        >>> session_read = model_to_read(chat_session, ChatSessionRead)
        >>> message_read = model_to_read(message, ChatMessageRead, extra={"custom_field": value})
    """
    data: dict[str, object] = extra.copy() if extra else {}
    data.update({k: v for k, v in model.__dict__.items() if not k.startswith("_")})
    return read_class.model_validate(data, from_attributes=True)


def model_to_read_simple[ReadT: BaseModel](model: object, read_class: type[ReadT]) -> ReadT:
    """简化版模型转响应结构函数。

    直接使用 Pydantic 的 from_attributes 进行转换，适用于字段完全匹配的场景。

    Args:
        model: 源模型对象
        read_class: 目标响应结构类

    Returns:
        转换后的响应结构对象

    Example:
        >>> run_read = model_to_read_simple(chat_run, ChatRunRead)
    """
    return read_class.model_validate(model, from_attributes=True)
