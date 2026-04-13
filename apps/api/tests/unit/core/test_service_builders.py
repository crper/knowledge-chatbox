from __future__ import annotations

from knowledge_chatbox_api.api import deps as api_deps
from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.service_builders import (
    build_auth_service,
    build_rate_limit_service,
    build_user_service,
    get_password_manager,
)
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService


def test_get_password_manager_returns_process_singleton() -> None:
    first_manager = get_password_manager()
    second_manager = get_password_manager()

    assert first_manager is second_manager


def test_build_auth_service_uses_shared_password_manager_and_db_backed_rate_limit(
    migrated_db_session,
) -> None:
    settings = get_settings()

    auth_service = build_auth_service(migrated_db_session, settings)

    assert auth_service.session is migrated_db_session
    assert auth_service.settings is settings
    assert auth_service.password_manager is get_password_manager()
    assert auth_service.rate_limit_service.repository is not None
    assert auth_service.rate_limit_service.repository.session is migrated_db_session


def test_build_user_service_reuses_explicit_auth_service_and_password_manager(
    migrated_db_session,
) -> None:
    settings = get_settings()
    password_manager = get_password_manager()
    auth_service = build_auth_service(
        migrated_db_session,
        settings,
        password_manager=password_manager,
        rate_limit_service=RateLimitService(max_attempts=2, window_seconds=30),
    )

    user_service = build_user_service(
        migrated_db_session,
        settings,
        password_manager=password_manager,
        auth_service=auth_service,
    )

    assert user_service.session is migrated_db_session
    assert user_service.password_manager is password_manager
    assert user_service.auth_service is auth_service


def test_api_deps_reuse_shared_password_manager_singleton() -> None:
    assert api_deps.get_password_manager() is get_password_manager()


def test_build_rate_limit_service_uses_settings_thresholds(migrated_db_session) -> None:
    settings = get_settings()

    rate_limit_service = build_rate_limit_service(migrated_db_session, settings)

    assert rate_limit_service.max_attempts == settings.login_rate_limit_attempts
    assert rate_limit_service.window_seconds == settings.login_rate_limit_window_seconds
    assert rate_limit_service.repository is not None
