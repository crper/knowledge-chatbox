"""FastAPI dependency providers shared by route modules."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.config import Settings, get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.db.session import get_db_session
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.enums import UserRole
from knowledge_chatbox_api.services.auth.auth_service import AuthService
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService
from knowledge_chatbox_api.services.auth.user_service import AuthorizationError, UserService

password_manager = PasswordManager()


@lru_cache
def _build_rate_limit_service(max_attempts: int, window_seconds: int) -> RateLimitService:
    """Cache one limiter per rate-limit configuration tuple."""
    return RateLimitService(max_attempts=max_attempts, window_seconds=window_seconds)


def get_password_manager() -> PasswordManager:
    """Return the process-wide password hasher wrapper."""
    return password_manager


def get_rate_limit_service() -> RateLimitService:
    """Return the login rate limiter initialised from current settings."""
    settings = get_settings()
    return _build_rate_limit_service(
        settings.login_rate_limit_attempts,
        settings.login_rate_limit_window_seconds,
    )


DbSessionDep = Annotated[Session, Depends(get_db_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
PasswordManagerDep = Annotated[PasswordManager, Depends(get_password_manager)]
RateLimiterDep = Annotated[RateLimitService, Depends(get_rate_limit_service)]


def get_auth_service(
    session: DbSessionDep,
    settings: SettingsDep,
    password_manager: PasswordManagerDep,
    limiter: RateLimiterDep,
) -> AuthService:
    """Construct an auth service for the current request."""
    return AuthService(
        session=session,
        settings=settings,
        password_manager=password_manager,
        rate_limit_service=limiter,
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_user_service(
    session: DbSessionDep,
    auth_service: AuthServiceDep,
    password_manager: PasswordManagerDep,
) -> UserService:
    """Construct a user management service for the current request."""
    return UserService(
        session=session,
        password_manager=password_manager,
        auth_service=auth_service,
    )


def get_session_token(request: Request) -> str | None:
    """Read the auth session token from the configured cookie name."""
    cookie_name = get_settings().session_cookie_name
    return request.cookies.get(cookie_name)


def get_current_user(
    token: Annotated[str | None, Depends(get_session_token)],
    auth_service: AuthServiceDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the authenticated user or raise an HTTP auth error."""
    if authorization:
        scheme, _, access_token = authorization.partition(" ")
        if scheme.lower() == "bearer" and access_token:
            return auth_service.get_current_user_from_access_token(access_token)
    return auth_service.get_current_user(token)


CurrentUserDep = Annotated[User, Depends(get_current_user)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]


def require_admin(current_user: CurrentUserDep) -> User:
    """Reject non-admin users before admin-only handlers run."""
    if current_user.role != UserRole.ADMIN:
        raise AuthorizationError("Admin permission required.")
    return current_user


AdminUserDep = Annotated[User, Depends(require_admin)]

__all__ = [
    "AdminUserDep",
    "AuthServiceDep",
    "CurrentUserDep",
    "DbSessionDep",
    "PasswordManagerDep",
    "RateLimiterDep",
    "SettingsDep",
    "UserServiceDep",
    "get_auth_service",
    "get_current_user",
    "get_db_session",
    "get_password_manager",
    "get_rate_limit_service",
    "get_session_token",
    "get_settings",
    "get_user_service",
    "require_admin",
]
