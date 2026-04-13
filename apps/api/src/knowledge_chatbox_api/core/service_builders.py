"""服务装配入口。

这里集中维护后端常用 service 的显式构造逻辑，避免 `api/deps.py`、
启动补偿和任务代码各自维护一套平行装配规则。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.repositories.rate_limit_repository import RateLimitRepository
from knowledge_chatbox_api.services.auth.auth_service import AuthService
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService
from knowledge_chatbox_api.services.auth.user_service import UserService

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from knowledge_chatbox_api.core.config import Settings

_password_manager = PasswordManager()


def get_password_manager() -> PasswordManager:
    """返回进程级 PasswordManager 单例。"""
    return _password_manager


def build_rate_limit_service(
    session: Session,
    settings: Settings,
    *,
    rate_limit_repository: RateLimitRepository | None = None,
    max_attempts: int | None = None,
    window_seconds: int | None = None,
) -> RateLimitService:
    """构造 DB 驱动的登录限流服务。

    Args:
        session: SQLAlchemy 数据库会话
        settings: 应用配置实例
        rate_limit_repository: 可选的自定义限流仓库，默认新建
        max_attempts: 可选的最大尝试次数，默认取 settings 中的值
        window_seconds: 可选的限流窗口秒数，默认取 settings 中的值

    Returns:
        配置完成的 RateLimitService 实例
    """
    repository = rate_limit_repository or RateLimitRepository(session)
    return RateLimitService(
        rate_limit_repository=repository,
        max_attempts=(settings.login_rate_limit_attempts if max_attempts is None else max_attempts),
        window_seconds=(
            settings.login_rate_limit_window_seconds if window_seconds is None else window_seconds
        ),
    )


def build_auth_service(
    session: Session,
    settings: Settings,
    *,
    password_manager: PasswordManager | None = None,
    rate_limit_service: RateLimitService | None = None,
) -> AuthService:
    """构造认证服务。

    Args:
        session: SQLAlchemy 数据库会话
        settings: 应用配置实例
        password_manager: 可选的自定义密码管理器，默认使用系统配置
        rate_limit_service: 可选的自定义限流服务，默认新建

    Returns:
        配置完成的 AuthService 实例，含限流和会话管理
    """
    active_password_manager = password_manager or get_password_manager()
    active_rate_limit_service = rate_limit_service or build_rate_limit_service(session, settings)
    return AuthService(
        session=session,
        settings=settings,
        password_manager=active_password_manager,
        rate_limit_service=active_rate_limit_service,
    )


def build_user_service(
    session: Session,
    settings: Settings,
    *,
    password_manager: PasswordManager | None = None,
    auth_service: AuthService | None = None,
) -> UserService:
    """构造用户管理服务。

    Args:
        session: SQLAlchemy 数据库会话
        settings: 应用配置实例
        password_manager: 可选的自定义密码管理器，默认使用系统配置
        auth_service: 可选的自定义认证服务，默认新建

    Returns:
        配置完成的 UserService 实例
    """
    active_password_manager = password_manager or get_password_manager()
    active_auth_service = auth_service or build_auth_service(
        session,
        settings,
        password_manager=active_password_manager,
    )
    return UserService(
        session=session,
        password_manager=active_password_manager,
        auth_service=active_auth_service,
    )
