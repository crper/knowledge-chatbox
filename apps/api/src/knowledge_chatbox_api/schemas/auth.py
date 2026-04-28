"""认证Pydantic 模型定义。"""

from datetime import datetime

from knowledge_chatbox_api.models.enums import ThemePreference, UserRole, UserStatus
from knowledge_chatbox_api.schemas import InputSchema, ReadOnlySchema
from knowledge_chatbox_api.schemas._validators import (
    CredentialPasswordStr,
    PasswordStr,
    UsernameStr,
)


class AuthUserRead(ReadOnlySchema):
    """描述认证用户响应体。"""

    id: int
    username: str
    role: UserRole
    status: UserStatus
    theme_preference: ThemePreference
    last_login_at: datetime | None
    password_changed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LoginRequest(InputSchema):
    """描述登录请求体。"""

    username: UsernameStr
    password: CredentialPasswordStr


class AccessTokenRead(ReadOnlySchema):
    """描述 access token 响应体。"""

    access_token: str
    expires_in: int
    token_type: str = "Bearer"  # noqa: S105


class LoginResponse(ReadOnlySchema):
    """描述登录响应体。"""

    access_token: str
    expires_in: int
    token_type: str = "Bearer"  # noqa: S105
    user: AuthUserRead


class SessionBootstrapRead(ReadOnlySchema):
    """描述启动期认证恢复结果。"""

    authenticated: bool
    access_token: str | None = None
    expires_in: int | None = None
    token_type: str = "Bearer"  # noqa: S105
    user: AuthUserRead | None = None


class ChangePasswordRequest(InputSchema):
    """描述Change密码请求体。"""

    current_password: CredentialPasswordStr
    new_password: PasswordStr


class UpdatePreferencesRequest(InputSchema):
    """描述Update偏好请求体。"""

    theme_preference: ThemePreference
