"""用户Pydantic 模型定义。"""

from datetime import datetime

from pydantic import BaseModel

from knowledge_chatbox_api.schemas._validators import (
    PasswordStr,
    RoleLiteral,
    StatusLiteral,
    ThemeLiteral,
    UsernameStr,
)


class UserRead(BaseModel):
    """描述用户响应体。"""

    id: int
    username: str
    role: RoleLiteral
    status: StatusLiteral
    theme_preference: ThemeLiteral
    created_by_user_id: int | None
    last_login_at: datetime | None
    password_changed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CreateUserRequest(BaseModel):
    """描述Create用户请求体。"""

    username: UsernameStr
    password: PasswordStr
    role: RoleLiteral


class UpdateUserRequest(BaseModel):
    """描述Update用户请求体。"""

    status: StatusLiteral | None = None
    role: RoleLiteral | None = None
    theme_preference: ThemeLiteral | None = None


class ResetPasswordRequest(BaseModel):
    """描述Reset密码请求体。"""

    new_password: PasswordStr
