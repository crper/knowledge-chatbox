from __future__ import annotations

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.models.chat import ChatSession
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.schemas.user import (
    CreateUserRequest,
    ResetPasswordRequest,
    UpdateUserRequest,
)
from knowledge_chatbox_api.services.auth.auth_service import AuthService, ValidationError
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService
from knowledge_chatbox_api.services.auth.user_service import (
    AuthorizationError,
    UserNotFoundError,
    UserService,
)


def create_service_pair(migrated_db_session) -> tuple[AuthService, UserService]:
    password_manager = PasswordManager()
    auth_service = AuthService(
        session=migrated_db_session,
        settings=get_settings(),
        password_manager=password_manager,
        rate_limit_service=RateLimitService(),
    )
    user_service = UserService(
        session=migrated_db_session,
        password_manager=password_manager,
        auth_service=auth_service,
    )
    return auth_service, user_service


def seed_admin(migrated_db_session) -> User:
    user = User(
        username="admin",
        password_hash=PasswordManager().hash_password("admin-123"),
        role="admin",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)
    return user


def seed_user(migrated_db_session, username: str = "alice") -> User:
    user = User(
        username=username,
        password_hash=PasswordManager().hash_password("secret-123"),
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)
    return user


def test_admin_can_create_user(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)

    user = user_service.create_user(admin, "alice", "secret-123", "user")

    assert user.username == "alice"
    assert user.created_by_user_id == admin.id


def test_admin_can_disable_and_enable_user(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)
    user = seed_user(migrated_db_session)

    disabled_user = user_service.update_user(admin, user.id, status="disabled")
    assert disabled_user.status == "disabled"

    enabled_user = user_service.update_user(admin, user.id, status="active")
    assert enabled_user.status == "active"


def test_admin_can_reset_password_and_revoke_sessions(migrated_db_session) -> None:
    auth_service, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)
    user = seed_user(migrated_db_session)
    auth_service.login("alice", "secret-123")

    user_service.reset_password(admin, user.id, "new-secret-456")

    session_row = migrated_db_session.scalar(
        select(AuthSession).where(AuthSession.user_id == user.id)
    )
    assert session_row is not None
    assert session_row.revoked_at is not None


def test_admin_can_delete_regular_user_and_cleanup_sessions(migrated_db_session) -> None:
    auth_service, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)
    user = seed_user(migrated_db_session)
    auth_service.login("alice", "secret-123")
    space = SpaceRepository(migrated_db_session).ensure_personal_space(user_id=user.id)
    migrated_db_session.add(ChatSession(space_id=space.id, user_id=user.id, title="demo"))
    migrated_db_session.commit()

    user_service.delete_user(admin, user.id)

    assert migrated_db_session.get(User, user.id) is None
    assert (
        migrated_db_session.scalar(select(AuthSession).where(AuthSession.user_id == user.id))
        is None
    )
    assert (
        migrated_db_session.scalar(select(ChatSession).where(ChatSession.user_id == user.id))
        is None
    )


def test_admin_cannot_disable_or_delete_admin_user(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    root_admin = seed_admin(migrated_db_session)
    second_admin = seed_user(migrated_db_session, username="ops")
    second_admin.role = "admin"
    migrated_db_session.commit()
    migrated_db_session.refresh(second_admin)

    with pytest.raises(ValidationError):
        user_service.update_user(root_admin, second_admin.id, status="disabled")

    with pytest.raises(ValidationError):
        user_service.delete_user(root_admin, second_admin.id)


def test_admin_cannot_demote_last_admin(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)

    with pytest.raises(ValidationError, match="At least one admin user is required."):
        user_service.update_user(admin, admin.id, role="user")


def test_non_admin_cannot_manage_users(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    user = seed_user(migrated_db_session)

    with pytest.raises(AuthorizationError):
        user_service.create_user(user, "bob", "secret-123", "user")


def test_admin_update_missing_user_raises_not_found(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)

    with pytest.raises(UserNotFoundError):
        user_service.update_user(admin, 999999, status="active")


def test_create_user_auto_creates_personal_space(migrated_db_session) -> None:
    auth_service, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)
    auth_service.ensure_default_admin()

    created_user = user_service.create_user(admin, "bob", "secret-123", "user")

    personal_space = migrated_db_session.scalar(
        select(Space).where(Space.slug == f"personal-space-{created_user.id}")
    )

    assert personal_space is not None
    assert personal_space.owner_user_id == created_user.id
    assert personal_space.kind == "personal"


@pytest.mark.parametrize(
    ("schema", "payload", "field"),
    [
        (
            CreateUserRequest,
            {"username": "", "password": "secret-123", "role": "user"},
            "username",
        ),
        (
            CreateUserRequest,
            {"username": "alice", "password": "1234567", "role": "user"},
            "password",
        ),
        (
            CreateUserRequest,
            {"username": "alice", "password": "secret-123", "role": "owner"},
            "role",
        ),
        (ResetPasswordRequest, {"new_password": "1234567"}, "new_password"),
        (UpdateUserRequest, {"role": "owner"}, "role"),
        (UpdateUserRequest, {"theme_preference": "blue"}, "theme_preference"),
    ],
)
def test_user_schemas_reject_invalid_payloads(
    schema,
    payload: dict[str, str],
    field: str,
) -> None:
    with pytest.raises(PydanticValidationError) as exc_info:
        schema.model_validate(payload)

    assert field in str(exc_info.value)
