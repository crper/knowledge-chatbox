from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError as PydanticValidationError
from tests.fixtures.factories import UserFactory

from knowledge_chatbox_api.core.config import Settings, get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.db import session as db_session
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    UpdateSettingsRequest,
)
from knowledge_chatbox_api.services.settings.runtime_settings import (
    ProviderRuntimeSettings,
    parse_runtime_settings,
)
from knowledge_chatbox_api.services.settings.settings_service import (
    MASKED_SECRET_VALUE,
    SettingsService,
)

_TEST_JWT_KEY = "test-jwt-secret-key-for-unit-tests-32ch"
_TEST_ADMIN_PW = "Admin123456"


def _test_settings(**overrides):
    return Settings(
        _env_file=None,
        jwt_secret_key=_TEST_JWT_KEY,
        initial_admin_password=_TEST_ADMIN_PW,
        **overrides,
    )


def create_settings_service(migrated_db_session) -> SettingsService:
    return SettingsService(migrated_db_session, get_settings())


def seed_admin(migrated_db_session):
    return UserFactory.persisted_create(
        migrated_db_session,
        username="admin",
        password_hash=PasswordManager().hash_password("admin-123"),
        role="admin",
    )


def test_settings_service_bootstraps_routes_and_profiles(migrated_db_session) -> None:
    service = SettingsService(migrated_db_session, _test_settings())

    settings_record = service.get_or_create_settings()

    assert settings_record.response_route.provider in {"ollama", "openai", "anthropic"}
    assert settings_record.embedding_route.provider in {"ollama", "openai", "voyage"}
    assert settings_record.vision_route.provider in {"ollama", "openai", "anthropic"}
    assert settings_record.system_prompt is not None
    assert len(settings_record.system_prompt) > 0


def test_settings_only_accepts_initial_response_provider_env(monkeypatch) -> None:
    monkeypatch.delenv("INITIAL_RESPONSE_PROVIDER", raising=False)
    monkeypatch.setenv("INITIAL_ACTIVE_PROVIDER", "anthropic")

    settings = _test_settings()

    assert settings.initial_response_provider == "ollama"

    monkeypatch.setenv("INITIAL_RESPONSE_PROVIDER", "anthropic")

    settings = _test_settings()

    assert settings.initial_response_provider == "anthropic"


def test_settings_accepts_comma_separated_cors_allow_origins(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000, http://127.0.0.1:5173",
    )

    settings = _test_settings()

    assert settings.cors_allow_origins == (
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    )


def test_settings_accepts_json_array_and_blank_cors_allow_origins(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        '["http://localhost:3000", "http://127.0.0.1:5173"]',
    )

    settings = _test_settings()

    assert settings.cors_allow_origins == (
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    )

    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "   ")

    settings = _test_settings()

    assert settings.cors_allow_origins == ()


def test_settings_resolves_storage_paths_to_absolute_runtime_paths(tmp_path) -> None:
    settings = _test_settings(
        project_root=tmp_path,
        data_dir=Path("runtime-data"),
        upload_dir=Path("uploads"),
        normalized_dir=Path("normalized"),
        sqlite_path=Path("sqlite/app.db"),
        chroma_path=Path("chroma"),
    )

    assert settings.data_dir == tmp_path / "runtime-data"
    assert settings.upload_dir == tmp_path / "uploads"
    assert settings.normalized_dir == tmp_path / "normalized"
    assert settings.sqlite_path == tmp_path / "sqlite/app.db"
    assert settings.chroma_path == tmp_path / "chroma"


def test_settings_positive_int_fields_reject_non_positive_values() -> None:
    with pytest.raises(PydanticValidationError):
        _test_settings(session_ttl_hours=0)

    with pytest.raises(PydanticValidationError):
        _test_settings(login_rate_limit_attempts=0)

    with pytest.raises(PydanticValidationError):
        _test_settings(initial_provider_timeout_seconds=0)


def test_parse_runtime_settings_accepts_attribute_and_mapping_inputs(migrated_db_session) -> None:
    service = create_settings_service(migrated_db_session)
    settings_record = service.get_or_create_settings_record()

    from_record = parse_runtime_settings(settings_record)
    from_mapping = parse_runtime_settings(
        {
            "provider_profiles": settings_record.provider_profiles.model_dump(),
            "response_route": settings_record.response_route.model_dump(),
            "embedding_route": settings_record.embedding_route.model_dump(),
            "vision_route": settings_record.vision_route.model_dump(),
            "system_prompt": settings_record.system_prompt,
            "provider_timeout_seconds": settings_record.provider_timeout_seconds,
            "active_index_generation": settings_record.active_index_generation,
            "reasoning_mode": "on",
        }
    )

    assert isinstance(from_record, ProviderRuntimeSettings)
    assert from_record.response_route.provider == "ollama"
    assert isinstance(from_mapping, ProviderRuntimeSettings)
    assert from_mapping.reasoning_mode == "on"


def test_settings_service_builds_test_settings_bundle(migrated_db_session) -> None:
    admin = seed_admin(migrated_db_session)
    service = create_settings_service(migrated_db_session)

    draft, runtime_settings = service.build_test_settings_bundle(
        admin,
        UpdateSettingsRequest(
            embedding_route=EmbeddingRouteConfig(provider="voyage", model="voyage-3.5")
        ),
    )

    assert draft.pending_embedding_route is not None
    assert runtime_settings.embedding_route.provider == "voyage"
    assert runtime_settings.embedding_route.model == "voyage-3.5"


def test_settings_service_masks_secret_fields_in_read_model(migrated_db_session) -> None:
    admin = seed_admin(migrated_db_session)
    service = create_settings_service(migrated_db_session)
    service.update_settings(
        admin,
        {
            "provider_profiles": {
                "openai": {
                    "api_key": "openai-secret",
                    "base_url": "https://api.openai.com/v1",
                }
            }
        },
    )

    result = service.get_or_create_settings()

    assert result.provider_profiles.openai.api_key == MASKED_SECRET_VALUE


def test_update_settings_normalizes_ollama_base_url_to_root_address(migrated_db_session) -> None:
    admin = seed_admin(migrated_db_session)
    service = create_settings_service(migrated_db_session)

    updated = service.update_settings(
        admin,
        {
            "provider_profiles": {
                "ollama": {
                    "base_url": "http://localhost:11434/v1/",
                }
            }
        },
    )

    assert updated.provider_profiles.ollama.base_url == "http://localhost:11434"


def test_update_settings_syncs_active_route_models_back_to_provider_templates(
    migrated_db_session,
) -> None:
    admin = seed_admin(migrated_db_session)
    service = create_settings_service(migrated_db_session)
    service.get_or_create_settings()

    updated = service.update_settings(
        admin,
        {
            "response_route": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "embedding_route": {"provider": "voyage", "model": "voyage-3.5-lite"},
            "vision_route": {"provider": "anthropic", "model": "claude-vision-4"},
        },
    )

    assert updated.provider_profiles.anthropic.chat_model == "claude-sonnet-4-5"
    assert updated.provider_profiles.anthropic.vision_model == "claude-vision-4"
    assert updated.provider_profiles.voyage.embedding_model == "voyage-3.5-lite"


def test_db_session_uses_singleton_engine_and_session_factory(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "app.db"))
    get_settings.cache_clear()

    first_engine = db_session.create_db_engine()
    second_engine = db_session.create_db_engine()
    first_factory = db_session.create_session_factory()
    second_factory = db_session.create_session_factory()

    assert first_engine is second_engine
    assert first_factory is second_factory


def test_settings_api_returns_capability_first_shape(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin123456"},
    )

    response = api_client.get("/api/settings")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert "provider_profiles" in payload
    assert payload["response_route"]["provider"] == "ollama"
    assert payload["embedding_route"]["provider"] == "ollama"
    assert payload["vision_route"]["provider"] == "ollama"
    assert payload["provider_profiles"]["openai"]["chat_model"] == "gpt-5.4"
    assert payload["provider_profiles"]["voyage"]["embedding_model"] == "voyage-3.5"


def test_test_routes_endpoint_returns_three_capabilities(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin123456"},
    )

    response = api_client.post(
        "/api/settings/test-routes",
        json={
            "response_route": {"provider": "openai", "model": "gpt-5.4"},
            "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            "vision_route": {"provider": "openai", "model": "gpt-5.4"},
        },
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert set(payload) == {"response", "embedding", "vision"}
