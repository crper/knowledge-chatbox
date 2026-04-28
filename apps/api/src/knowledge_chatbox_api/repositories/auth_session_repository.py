from sqlalchemy import delete, select, update

from knowledge_chatbox_api.models.auth import AuthSession
from knowledge_chatbox_api.repositories.base import BaseRepository
from knowledge_chatbox_api.utils.timing import utc_now


class AuthSessionRepository(BaseRepository[AuthSession]):
    model_type = AuthSession

    def get_active_by_token_hash(self, token_hash: str) -> AuthSession | None:
        statement = select(AuthSession).where(
            AuthSession.session_token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utc_now(),
        )
        return self.session.scalar(statement)

    def revoke_by_user_id(self, user_id: int) -> None:
        now = utc_now()
        self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )

    def revoke_by_token_hash(self, token_hash: str) -> None:
        now = utc_now()
        self.session.execute(
            update(AuthSession)
            .where(AuthSession.session_token_hash == token_hash)
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )

    def delete_by_user_id(self, user_id: int) -> None:
        self.session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))

    def cleanup_expired(self) -> None:
        now = utc_now()
        self.session.execute(
            update(AuthSession)
            .where(
                AuthSession.expires_at <= now,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )
