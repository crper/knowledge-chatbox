"""路由层通用转换函数。"""

from pydantic import BaseModel


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
