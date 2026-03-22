"""认证会话仓储数据访问实现。"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.auth import AuthSession


class AuthSessionRepository:
    """封装认证会话数据访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, auth_session: AuthSession) -> AuthSession:
        """创建Create。"""
        self.session.add(auth_session)
        self.session.flush()
        return auth_session

    def get_active_by_token_hash(self, token_hash: str) -> AuthSession | None:
        """获取活跃By令牌Hash。"""
        statement = select(AuthSession).where(
            AuthSession.session_token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        return self.session.scalar(statement)

    def revoke_by_user_id(self, user_id: int) -> None:
        """处理RevokeBy用户Id相关逻辑。"""
        now = datetime.now(UTC)
        self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )

    def revoke_by_token_hash(self, token_hash: str) -> None:
        """处理RevokeBy令牌Hash相关逻辑。"""
        auth_session = self.session.scalar(
            select(AuthSession).where(AuthSession.session_token_hash == token_hash)
        )
        if auth_session is not None:
            auth_session.revoked_at = datetime.now(UTC)

    def delete_by_user_id(self, user_id: int) -> None:
        """删除By用户Id。"""
        self.session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))

    def cleanup_expired(self) -> None:
        """处理CleanupExpired相关逻辑。"""
        now = datetime.now(UTC)
        self.session.execute(
            update(AuthSession)
            .where(
                AuthSession.expires_at <= now,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )
