"""用户Pydantic 模型定义。"""

from datetime import datetime

from pydantic import BaseModel

from knowledge_chatbox_api.models.enums import ThemePreference, UserRole, UserStatus
from knowledge_chatbox_api.schemas._validators import (
    PasswordStr,
    UsernameStr,
)


class UserRead(BaseModel):
    """描述用户响应体。"""

    id: int
    username: str
    role: UserRole
    status: UserStatus
    theme_preference: ThemePreference
    created_by_user_id: int | None
    last_login_at: datetime | None
    password_changed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CreateUserRequest(BaseModel):
    """描述Create用户请求体。"""

    username: UsernameStr
    password: PasswordStr
    role: UserRole


class UpdateUserRequest(BaseModel):
    """描述Update用户请求体。"""

    status: UserStatus | None = None
    role: UserRole | None = None
    theme_preference: ThemePreference | None = None


class ResetPasswordRequest(BaseModel):
    """描述Reset密码请求体。"""

    new_password: PasswordStr
