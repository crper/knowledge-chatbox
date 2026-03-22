from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from argon2 import PasswordHasher
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.models.chat import ChatSession
from knowledge_chatbox_api.services.auth.auth_service import (
    AuthService,
    InvalidCredentialsError,
    RateLimitExceededError,
)
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService


def build_auth_service(migrated_db_session) -> AuthService:
    return AuthService(
        session=migrated_db_session,
        settings=get_settings(),
        password_manager=PasswordManager(),
        rate_limit_service=RateLimitService(),
    )


def test_user_username_must_be_unique(migrated_db_session) -> None:
    first_user = User(
        username="admin",
        password_hash="hash-1",
        role="admin",
        status="active",
        theme_preference="system",
    )
    duplicated_user = User(
        username="admin",
        password_hash="hash-2",
        role="user",
        status="active",
        theme_preference="light",
    )

    migrated_db_session.add(first_user)
    migrated_db_session.commit()

    migrated_db_session.add(duplicated_user)

    with pytest.raises(IntegrityError):
        migrated_db_session.commit()


@pytest.mark.parametrize(
    ("field", "value"),
    [("role", "owner"), ("status", "paused"), ("theme_preference", "blue")],
)
def test_user_enum_like_fields_are_constrained(migrated_db_session, field: str, value: str) -> None:
    user = User(
        username=f"user-{field}",
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    setattr(user, field, value)

    migrated_db_session.add(user)

    with pytest.raises(IntegrityError):
        migrated_db_session.commit()


def test_auth_session_and_chat_session_require_existing_user(migrated_db_session) -> None:
    auth_session = AuthSession(
        user_id=9999,
        session_token_hash="token-hash",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    chat_session = ChatSession(user_id=9999, title="hello")

    migrated_db_session.add(auth_session)
    with pytest.raises(IntegrityError):
        migrated_db_session.commit()

    migrated_db_session.rollback()
    migrated_db_session.add(chat_session)

    with pytest.raises(IntegrityError):
        migrated_db_session.commit()


def test_ensure_default_admin_creates_admin_user(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "admin123456")
    service = build_auth_service(migrated_db_session)

    user = service.ensure_default_admin()

    assert user.username == "admin"
    assert user.role == "admin"
    assert user.password_hash != "admin123456"


def test_login_creates_session_and_rehashes_password(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_hasher = PasswordHasher(time_cost=1, memory_cost=8 * 1024, parallelism=1)
    user = User(
        username="alice",
        password_hash=old_hasher.hash("secret-123"),
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "admin123456")

    service = build_auth_service(migrated_db_session)
    refresh_token, access_token, logged_in_user = service.login("alice", "secret-123")

    sessions = migrated_db_session.scalars(
        select(AuthSession).where(AuthSession.user_id == user.id)
    ).all()

    assert refresh_token
    assert access_token
    assert logged_in_user.id == user.id
    assert len(sessions) == 1
    assert user.password_hash != old_hasher.hash("secret-123")


def test_change_password_revokes_existing_sessions(migrated_db_session) -> None:
    password_manager = PasswordManager()
    user = User(
        username="alice",
        password_hash=password_manager.hash_password("secret-123"),
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    service = build_auth_service(migrated_db_session)
    _, _, current_user = service.login("alice", "secret-123")

    service.change_password(current_user, "secret-123", "new-secret-456")

    session_row = migrated_db_session.scalar(
        select(AuthSession).where(AuthSession.user_id == user.id)
    )
    assert session_row is not None
    assert session_row.revoked_at is not None

    with pytest.raises(InvalidCredentialsError):
        service.login("alice", "secret-123")

    refresh_token, access_token, _ = service.login("alice", "new-secret-456")
    assert refresh_token
    assert access_token


def test_update_preferences_persists_theme_preference(migrated_db_session) -> None:
    password_manager = PasswordManager()
    user = User(
        username="alice",
        password_hash=password_manager.hash_password("secret-123"),
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    service = build_auth_service(migrated_db_session)
    updated_user = service.update_preferences(user, "dark")

    assert updated_user.theme_preference == "dark"


def test_login_failure_is_rate_limited(migrated_db_session) -> None:
    password_manager = PasswordManager()
    user = User(
        username="alice",
        password_hash=password_manager.hash_password("secret-123"),
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()

    service = AuthService(
        session=migrated_db_session,
        settings=get_settings(),
        password_manager=password_manager,
        rate_limit_service=RateLimitService(max_attempts=2, window_seconds=60),
    )

    with pytest.raises(InvalidCredentialsError):
        service.login("alice", "wrong-1")

    with pytest.raises(InvalidCredentialsError):
        service.login("alice", "wrong-2")

    with pytest.raises(RateLimitExceededError):
        service.login("alice", "wrong-3")
