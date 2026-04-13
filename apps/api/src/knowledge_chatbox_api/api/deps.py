"""FastAPI dependency providers shared by route modules."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.config import Settings, get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.core.service_builders import (
    build_auth_service,
    build_rate_limit_service,
    build_user_service,
    get_password_manager,
)
from knowledge_chatbox_api.db.session import get_db_session
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.enums import UserRole
from knowledge_chatbox_api.services.auth.auth_service import AuthService
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService
from knowledge_chatbox_api.services.auth.user_service import AuthorizationError, UserService


def get_rate_limit_service_dep(
    session: DbSessionDep,
    settings: SettingsDep,
) -> RateLimitService:
    return build_rate_limit_service(session, settings)


def get_auth_service_dep(
    session: DbSessionDep,
    settings: SettingsDep,
    password_manager: PasswordManagerDep,
    limiter: RateLimiterDep,
) -> AuthService:
    return build_auth_service(
        session,
        settings,
        password_manager=password_manager,
        rate_limit_service=limiter,
    )


def get_user_service_dep(
    session: DbSessionDep,
    settings: SettingsDep,
    auth_service: AuthServiceDep,
    password_manager: PasswordManagerDep,
) -> UserService:
    return build_user_service(
        session,
        settings,
        password_manager=password_manager,
        auth_service=auth_service,
    )


def get_session_token(
    request: Request,
    settings: SettingsDep,
) -> str | None:
    return request.cookies.get(settings.session_cookie_name)


def get_current_user(
    token: Annotated[str | None, Depends(get_session_token)],
    auth_service: AuthServiceDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if authorization:
        scheme, _, access_token = authorization.partition(" ")
        if scheme.lower() == "bearer" and access_token:
            return auth_service.get_current_user_from_access_token(access_token)
    return auth_service.get_current_user(token)


def require_admin(current_user: CurrentUserDep) -> User:
    if current_user.role != UserRole.ADMIN:
        raise AuthorizationError("Admin permission required.")
    return current_user


DbSessionDep = Annotated[Session, Depends(get_db_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
PasswordManagerDep = Annotated[PasswordManager, Depends(get_password_manager)]
RateLimiterDep = Annotated[RateLimitService, Depends(get_rate_limit_service_dep)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service_dep)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
UserServiceDep = Annotated[UserService, Depends(get_user_service_dep)]
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
    "get_auth_service_dep",
    "get_current_user",
    "get_db_session",
    "get_password_manager",
    "get_rate_limit_service_dep",
    "get_session_token",
    "get_settings",
    "require_admin",
]
