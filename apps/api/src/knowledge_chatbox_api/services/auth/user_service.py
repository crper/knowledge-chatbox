"""认证相关服务模块。"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.repositories.user_repository import UserRepository
from knowledge_chatbox_api.services.auth.auth_service import (
    AuthError,
    AuthService,
    ConflictError,
    ValidationError,
)


class AuthorizationError(AuthError):
    """封装Authorization异常。"""

    status_code = 403
    code = "forbidden"


class UserNotFoundError(AuthError):
    """用户不存在。"""

    status_code = 404
    code = "user_not_found"
    default_message = "User not found."


class UserService:
    """封装用户管理相关业务逻辑。"""

    def __init__(
        self,
        session: Session,
        password_manager: PasswordManager,
        auth_service: AuthService,
    ) -> None:
        self.session = session
        self.password_manager = password_manager
        self.auth_service = auth_service
        self.user_repository = UserRepository(session)
        self.chat_repository = ChatRepository(session)
        self.space_repository = SpaceRepository(session)

    def list_users(self, actor: User) -> list[User]:
        """列出用户。"""
        self._require_admin(actor)
        return self.user_repository.list_users()

    def create_user(self, actor: User, username: str, password: str, role: str) -> User:
        """创建用户。"""
        self._require_admin(actor)
        if role not in {"admin", "user"}:
            raise ValidationError("Invalid role.")
        if self.user_repository.get_by_username(username) is not None:
            raise ConflictError("Username already exists.")

        user = User(
            username=username,
            password_hash=self.password_manager.hash_password(password),
            role=role,
            status="active",
            created_by_user_id=actor.id,
            theme_preference="system",
        )
        self.user_repository.add(user)
        self.space_repository.ensure_personal_space(user_id=user.id)
        self.session.commit()
        self.session.refresh(user)
        return user

    def update_user(
        self,
        actor: User,
        user_id: int,
        status: str | None = None,
        role: str | None = None,
        theme_preference: str | None = None,
    ) -> User:
        """更新用户。"""
        self._require_admin(actor)
        user = self._get_required_user(user_id)
        if status is not None:
            if status not in {"active", "disabled"}:
                raise ValidationError("Invalid status.")
            if user.role == "admin":
                raise ValidationError("Admin users cannot be disabled.")
            user.status = status
            if status == "disabled":
                self.auth_service.auth_session_repository.revoke_by_user_id(user.id)
        if role is not None:
            if role not in {"admin", "user"}:
                raise ValidationError("Invalid role.")
            if (
                user.role == "admin"
                and role != "admin"
                and self.user_repository.count_admins() <= 1
            ):
                raise ValidationError("At least one admin user is required.")
            user.role = role
        if theme_preference is not None:
            if theme_preference not in {"light", "dark", "system"}:
                raise ValidationError("Invalid theme preference.")
            user.theme_preference = theme_preference
        self.session.commit()
        self.session.refresh(user)
        return user

    def delete_user(self, actor: User, user_id: int) -> None:
        """删除用户。"""
        self._require_admin(actor)
        user = self._get_required_user(user_id)
        if user.role == "admin":
            raise ValidationError("Admin users cannot be deleted.")

        self.auth_service.auth_session_repository.delete_by_user_id(user.id)
        self.chat_repository.delete_sessions_by_user_id(user.id)
        self.user_repository.delete(user)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ValidationError("User has related records and cannot be deleted.") from exc

    def reset_password(self, actor: User, user_id: int, new_password: str) -> User:
        """重置密码。"""
        self._require_admin(actor)
        user = self._get_required_user(user_id)
        user.password_hash = self.password_manager.hash_password(new_password)
        self.auth_service.auth_session_repository.revoke_by_user_id(user.id)
        self.session.commit()
        self.session.refresh(user)
        return user

    def _require_admin(self, actor: User) -> None:
        if actor.role != "admin":
            raise AuthorizationError("Admin permission required.")

    def _get_required_user(self, user_id: int) -> User:
        user = self.user_repository.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError()
        return user
