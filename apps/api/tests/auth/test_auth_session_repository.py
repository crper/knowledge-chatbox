from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.repositories.auth_session_repository import AuthSessionRepository


def _create_user(session, username: str = "alice") -> User:
    user = User(
        username=username,
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_revoke_by_user_id_revokes_all_sessions(migrated_db_session) -> None:
    user = _create_user(migrated_db_session)
    now = datetime.now(UTC)
    migrated_db_session.add_all(
        [
            AuthSession(
                user_id=user.id,
                session_token_hash="token-1",
                expires_at=now + timedelta(hours=1),
            ),
            AuthSession(
                user_id=user.id,
                session_token_hash="token-2",
                expires_at=now + timedelta(hours=2),
            ),
        ]
    )
    migrated_db_session.commit()

    repository = AuthSessionRepository(migrated_db_session)

    repository.revoke_by_user_id(user.id)
    migrated_db_session.commit()

    sessions = migrated_db_session.scalars(
        select(AuthSession).where(AuthSession.user_id == user.id).order_by(AuthSession.id.asc())
    ).all()
    assert len(sessions) == 2
    assert all(item.revoked_at is not None for item in sessions)


def test_cleanup_expired_revokes_only_active_expired_sessions(migrated_db_session) -> None:
    user = _create_user(migrated_db_session)
    now = datetime.now(UTC)
    expired_active = AuthSession(
        user_id=user.id,
        session_token_hash="expired-active",
        expires_at=now - timedelta(minutes=5),
    )
    active = AuthSession(
        user_id=user.id,
        session_token_hash="active",
        expires_at=now + timedelta(minutes=5),
    )
    expired_revoked = AuthSession(
        user_id=user.id,
        session_token_hash="expired-revoked",
        expires_at=now - timedelta(minutes=10),
        revoked_at=now - timedelta(minutes=1),
    )
    migrated_db_session.add_all([expired_active, active, expired_revoked])
    migrated_db_session.commit()

    repository = AuthSessionRepository(migrated_db_session)

    repository.cleanup_expired()
    migrated_db_session.commit()

    refreshed = {
        item.session_token_hash: item
        for item in migrated_db_session.scalars(
            select(AuthSession).where(AuthSession.user_id == user.id)
        ).all()
    }
    assert refreshed["expired-active"].revoked_at is not None
    assert refreshed["active"].revoked_at is None
    assert refreshed["expired-revoked"].revoked_at == expired_revoked.revoked_at
