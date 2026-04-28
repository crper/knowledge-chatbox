"""Pydantic 模型统一入口。

本模块提供项目统一的 Pydantic 基础类和配置规范，
所有数据模型定义应继承自此处导出的基类。
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

__all__ = [
    "BaseModel",
    "BaseSchema",
    "BaseSettings",
    "ConfigDict",
    "Field",
    "InputSchema",
    "ReadOnlySchema",
    "SettingsConfigDict",
    "SettingsSchema",
]


class BaseSchema(BaseModel):
    """项目统一的 Pydantic 基类。

    所有数据模型应继承此类，以确保配置一致性：
    - 禁止额外字段（extra='forbid'）
    - 支持字段别名（populate_by_name=True）
    - ORM 模式支持（from_attributes=True）
    - 冻结配置可选（frozen=False）

    Example:
        >>> class UserRead(BaseSchema):
        ...     id: int
        ...     username: str
        ...     email: str | None = None
    """

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        from_attributes=True,
        frozen=False,
        str_strip_whitespace=True,
        str_min_length=0,
    )


class ReadOnlySchema(BaseSchema):
    """只读数据模型基类。

    适用于响应体、数据库读取记录等只读场景，
    实例创建后不可修改（frozen=True）。

    Example:
        >>> class DocumentSummaryRead(ReadOnlySchema):
        ...     id: int
        ...     title: str
        ...     created_at: datetime
    """

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        from_attributes=True,
        frozen=True,
    )


class InputSchema(BaseSchema):
    """输入数据模型基类。

    适用于 API 请求体、用户输入等场景，
    允许额外字段忽略（extra='ignore'）。

    Example:
        >>> class CreateUserRequest(InputSchema):
        ...     username: str = Field(min_length=3, max_length=64)
        ...     password: str = Field(min_length=8)
        ...     email: str | None = None
    """

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        from_attributes=False,
        frozen=False,
        str_strip_whitespace=True,
        str_min_length=1,
    )


class SettingsSchema(BaseSettings):
    """配置设置模型基类。

    适用于应用配置、环境变量读取等场景。

    Example:
        >>> class AppSettings(SettingsSchema):
        ...     app_name: str = "Knowledge Chatbox"
        ...     debug: bool = False
        ...     database_url: str
    """

    model_config = SettingsConfigDict(
        extra="forbid",
        populate_by_name=True,
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_nested_delimiter="__",
    )
