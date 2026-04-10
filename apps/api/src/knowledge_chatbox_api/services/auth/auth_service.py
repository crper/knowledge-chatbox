"""认证相关服务模块。"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.core.errors import AppError
from knowledge_chatbox_api.core.security import (
    PasswordManager,
    create_access_token,
    decode_access_token,
    generate_session_token,
    hash_session_token,
)
from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.models.enums import ThemePreference, UserRole, UserStatus
from knowledge_chatbox_api.repositories.auth_session_repository import AuthSessionRepository
from knowledge_chatbox_api.repositories.user_repository import UserRepository
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService


class AuthError(AppError):
    """认证相关业务异常基类。"""

    status_code = 400
    code = "auth_error"
    default_message = "Authentication error."


class InvalidCredentialsError(AuthError):
    """表示用户名或密码错误。"""

    status_code = 401
    code = "invalid_credentials"


class UnauthorizedError(AuthError):
    """表示当前请求未通过认证。"""

    status_code = 401
    code = "unauthorized"


class RateLimitExceededError(AuthError):
    """表示请求触发了登录限流。"""

    status_code = 429
    code = "rate_limited"


class ConflictError(AuthError):
    """表示当前操作与现有状态冲突。"""

    status_code = 409
    code = "conflict"


class ValidationError(AuthError):
    """表示输入参数校验失败。"""

    status_code = 400
    code = "validation_error"


class AuthService:
    """封装登录、会话和偏好更新逻辑。"""

    def __init__(
        self,
        session: Session,
        settings: Settings,
        password_manager: PasswordManager,
        rate_limit_service: RateLimitService,
    ) -> None:
        self.session = session
        self.settings = settings
        self.password_manager = password_manager
        self.rate_limit_service = rate_limit_service
        self.user_repository = UserRepository(session)
        self.auth_session_repository = AuthSessionRepository(session)

    def ensure_default_admin(self) -> User:
        """确保默认管理员。"""
        admin = self.user_repository.get_by_username(self.settings.initial_admin_username)
        if admin is not None:
            return admin

        admin = User(
            username=self.settings.initial_admin_username,
            password_hash=self.password_manager.hash_password(self.settings.initial_admin_password),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            theme_preference=ThemePreference.SYSTEM,
        )
        try:
            self.user_repository.add(admin)
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            admin = self.user_repository.get_by_username(self.settings.initial_admin_username)
            if admin is None:
                raise
        self.session.refresh(admin)
        return admin

    def _build_access_token(self, user: User) -> str:
        return create_access_token(
            algorithm=self.settings.jwt_algorithm,
            expires_in_minutes=self.settings.access_token_ttl_minutes,
            role=user.role,
            secret_key=self.settings.jwt_secret_key,
            user_id=user.id,
        )

    def _create_refresh_session(self, user: User) -> str:
        token = generate_session_token()
        now = datetime.now(UTC)
        auth_session = AuthSession(
            user_id=user.id,
            session_token_hash=hash_session_token(token),
            expires_at=now + timedelta(hours=self.settings.session_ttl_hours),
            last_seen_at=now,
        )
        self.auth_session_repository.create(auth_session)
        return token

    def login(self, username: str, password: str) -> tuple[str, str, User]:
        """执行登录并创建认证会话。"""
        self.auth_session_repository.cleanup_expired()
        if self.rate_limit_service.is_limited(username):
            raise RateLimitExceededError("Too many failed login attempts.")

        user = self.user_repository.get_by_username(username)
        if user is None or user.status != UserStatus.ACTIVE:
            self.rate_limit_service.record_failure(username)
            raise InvalidCredentialsError("Invalid username or password.")

        verified, updated_hash = self.password_manager.verify_password(user.password_hash, password)
        if not verified:
            self.rate_limit_service.record_failure(username)
            raise InvalidCredentialsError("Invalid username or password.")

        if updated_hash is not None:
            user.password_hash = updated_hash

        now = datetime.now(UTC)
        refresh_token = self._create_refresh_session(user)
        user.last_login_at = now
        self.session.commit()
        self.session.refresh(user)
        self.rate_limit_service.reset(username)
        return refresh_token, self._build_access_token(user), user

    def logout(self, token: str | None) -> None:
        """注销当前认证会话。"""
        if not token:
            return
        self.auth_session_repository.revoke_by_token_hash(hash_session_token(token))
        self.session.commit()

    def get_current_user(self, token: str | None) -> User:
        """返回当前登录用户。"""
        if not token:
            raise UnauthorizedError("Authentication required.")
        auth_session = self.auth_session_repository.get_active_by_token_hash(
            hash_session_token(token)
        )
        if auth_session is None:
            raise UnauthorizedError("Authentication required.")
        user = self.user_repository.get_by_id(auth_session.user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            raise UnauthorizedError("Authentication required.")
        return user

    def get_current_user_from_access_token(self, token: str | None) -> User:
        """通过 access token 返回当前用户。"""
        if not token:
            raise UnauthorizedError("Authentication required.")

        try:
            payload = decode_access_token(
                algorithm=self.settings.jwt_algorithm,
                secret_key=self.settings.jwt_secret_key,
                token=token,
            )
        except ValueError as error:
            raise UnauthorizedError(str(error)) from error

        user_id_raw = payload.get("sub")
        if not isinstance(user_id_raw, str) or not user_id_raw.isdigit():
            raise UnauthorizedError("Authentication required.")

        user = self.user_repository.get_by_id(int(user_id_raw))
        if user is None or user.status != UserStatus.ACTIVE:
            raise UnauthorizedError("Authentication required.")

        issued_at = payload.get("iat")
        if (
            isinstance(issued_at, int)
            and user.password_changed_at is not None
            and int(user.password_changed_at.timestamp()) >= issued_at
        ):
            raise UnauthorizedError("Authentication required.")

        return user

    def refresh_access_token(self, token: str | None) -> tuple[str, str]:
        """刷新 access token，并轮换 refresh session。"""
        user = self.get_current_user(token)
        if token is None:
            raise UnauthorizedError("Authentication required.")
        self.auth_session_repository.revoke_by_token_hash(hash_session_token(token))
        refresh_token = self._create_refresh_session(user)
        self.session.commit()
        return refresh_token, self._build_access_token(user)

    def bootstrap_session(self, token: str | None) -> tuple[str, User] | None:
        """启动期尝试恢复会话；匿名态返回 None，而不是抛认证异常。"""
        try:
            user = self.get_current_user(token)
        except UnauthorizedError:
            return None

        return self._build_access_token(user), user

    def change_password(self, user: User, current_password: str, new_password: str) -> User:
        """修改密码。"""
        verified, _ = self.password_manager.verify_password(user.password_hash, current_password)
        if not verified:
            raise InvalidCredentialsError("Current password is incorrect.")
        user.password_hash = self.password_manager.hash_password(new_password)
        user.password_changed_at = datetime.now(UTC)
        self.auth_session_repository.revoke_by_user_id(user.id)
        self.session.commit()
        self.session.refresh(user)
        return user

    def update_preferences(self, user: User, theme_preference: str) -> User:
        """更新偏好。"""
        try:
            validated_theme = ThemePreference(theme_preference)
        except ValueError as exc:
            raise ValidationError("Invalid theme preference.") from exc
        user.theme_preference = validated_theme
        self.session.commit()
        self.session.refresh(user)
        return user
