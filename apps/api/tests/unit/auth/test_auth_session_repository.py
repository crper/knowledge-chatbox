from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from tests.fixtures.factories import AuthSessionFactory, UserFactory

from knowledge_chatbox_api.models.auth import AuthSession
from knowledge_chatbox_api.repositories.auth_session_repository import AuthSessionRepository


def test_revoke_by_user_id_revokes_all_sessions(migrated_db_session) -> None:
    user = UserFactory.persisted_create(migrated_db_session, username="alice")
    now = datetime.now(UTC)
    _h1 = timedelta(hours=1)
    _h2 = timedelta(hours=2)
    migrated_db_session.add_all(
        [
            AuthSessionFactory.build(
                user_id=user.id, session_token_hash="token-1", expires_at=now + _h1
            ),
            AuthSessionFactory.build(
                user_id=user.id, session_token_hash="token-2", expires_at=now + _h2
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
    user = UserFactory.persisted_create(migrated_db_session, username="alice")
    now = datetime.now(UTC)
    expired_active = AuthSessionFactory.build(
        user_id=user.id,
        session_token_hash="expired-active",
        expires_at=now - timedelta(minutes=5),
    )
    active = AuthSessionFactory.build(
        user_id=user.id,
        session_token_hash="active",
        expires_at=now + timedelta(minutes=5),
    )
    expired_revoked = AuthSessionFactory.build(
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
