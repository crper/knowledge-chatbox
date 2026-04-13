from __future__ import annotations

import pytest
from sqlalchemy import select
from tests.fixtures.factories import ChatSessionFactory, UserFactory

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.service_builders import (
    build_auth_service,
    build_user_service,
    get_password_manager,
)
from knowledge_chatbox_api.models.auth import AuthSession
from knowledge_chatbox_api.models.chat import ChatSession
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.services.auth.auth_service import AuthService, ValidationError
from knowledge_chatbox_api.services.auth.user_service import (
    AuthorizationError,
    UserService,
)


def create_service_pair(migrated_db_session) -> tuple[AuthService, UserService]:
    settings = get_settings()
    password_manager = get_password_manager()
    auth_service = build_auth_service(
        migrated_db_session,
        settings,
        password_manager=password_manager,
    )
    user_service = build_user_service(
        migrated_db_session,
        settings,
        password_manager=password_manager,
        auth_service=auth_service,
    )
    return auth_service, user_service


def seed_admin(migrated_db_session):
    return UserFactory.persisted_create(
        migrated_db_session,
        username="admin",
        password_hash=get_password_manager().hash_password("admin-123"),
        role="admin",
    )


def seed_user(migrated_db_session, username: str = "alice"):
    return UserFactory.persisted_create(
        migrated_db_session,
        username=username,
        password_hash=get_password_manager().hash_password("secret-123"),
    )


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
    migrated_db_session.add(
        ChatSessionFactory.build(space_id=space.id, user_id=user.id, title="demo")
    )
    migrated_db_session.commit()

    user_service.delete_user(admin, user.id)

    assert migrated_db_session.get(type(user), user.id) is None
    assert (
        migrated_db_session.scalar(select(AuthSession).where(AuthSession.user_id == user.id))
        is None
    )
    assert (
        migrated_db_session.scalar(select(ChatSession).where(ChatSession.user_id == user.id))
        is None
    )


def test_admin_cannot_demote_last_admin(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    admin = seed_admin(migrated_db_session)

    with pytest.raises(ValidationError, match=r"At least one admin user is required\."):
        user_service.update_user(admin, admin.id, role="user")


def test_non_admin_cannot_manage_users(migrated_db_session) -> None:
    _, user_service = create_service_pair(migrated_db_session)
    user = seed_user(migrated_db_session)

    with pytest.raises(AuthorizationError):
        user_service.create_user(user, "bob", "secret-123", "user")


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
