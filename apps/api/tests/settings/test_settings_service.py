from __future__ import annotations

from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError as PydanticValidationError

from knowledge_chatbox_api.core.config import Settings, get_settings
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.db import session as db_session
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ResponseRouteConfig,
    UpdateSettingsRequest,
    VisionRouteConfig,
    dump_embedding_route,
    dump_provider_profiles,
    dump_response_route,
    dump_vision_route,
    parse_embedding_route,
    parse_provider_profiles,
    parse_response_route,
    parse_vision_route,
)
from knowledge_chatbox_api.services.settings.runtime_settings import (
    ProviderRuntimeSettings,
    parse_runtime_settings,
)
from knowledge_chatbox_api.services.settings.settings_service import (
    DEFAULT_SYSTEM_PROMPT,
    MASKED_SECRET_VALUE,
    SettingsService,
)


def create_settings_service(migrated_db_session) -> SettingsService:
    return SettingsService(migrated_db_session, get_settings())


def seed_admin(migrated_db_session) -> User:
    user = User(
        username="admin",
        password_hash=PasswordManager().hash_password("admin-123"),
        role="admin",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)
    return user


def test_settings_service_bootstraps_routes_and_profiles(migrated_db_session) -> None:
    service = SettingsService(migrated_db_session, Settings(_env_file=None))

    settings_record = service.get_or_create_settings()
    expected_system_prompt = "\n".join(
        (
            "你是 Knowledge Chatbox 的知识工作台助手。",
            "你的首要任务是基于当前问题、当前会话历史和当前检索到的资料，给出准确、简洁、可执行的回答。",
            "先回答用户真正的问题，先给结论，再给依据；如果有必要，再补下一步建议。",
            "优先使用资料事实，不要编造未在上下文中出现的信息；如果用了推断或通用经验，必须明确标注。",
            "当资料不足以支撑结论时，要明确说明资料不足，并提出一个最小必要的补充问题。",
            "对实现、排障、配置类问题，优先给步骤、判断顺序和可执行建议，不要先写大段背景介绍。",
            "不要输出营销话术、寒暄铺垫或重复用户问题。",
            "永远回复中文。",
        )
    )

    assert settings_record.response_route.model_dump() == {
        "provider": "openai",
        "model": "gpt-5.4",
    }
    assert settings_record.embedding_route.model_dump() == {
        "provider": "openai",
        "model": "text-embedding-3-small",
    }
    assert settings_record.vision_route.model_dump() == {
        "provider": "openai",
        "model": "gpt-5.4",
    }
    assert settings_record.provider_profiles.openai.base_url == "https://api.openai.com/v1"
    assert settings_record.provider_profiles.openai.chat_model == "gpt-5.4"
    assert settings_record.provider_profiles.openai.embedding_model == "text-embedding-3-small"
    assert settings_record.provider_profiles.openai.vision_model == "gpt-5.4"
    assert settings_record.provider_profiles.anthropic.chat_model == "claude-sonnet-4-5"
    assert settings_record.provider_profiles.anthropic.vision_model == "claude-sonnet-4-5"
    assert settings_record.provider_profiles.voyage.embedding_model == "voyage-3.5"
    assert settings_record.provider_profiles.ollama.chat_model == "qwen3.5:4b"
    assert settings_record.provider_profiles.ollama.embedding_model == "nomic-embed-text"
    assert settings_record.provider_profiles.ollama.vision_model == "qwen3.5:4b"
    assert settings_record.system_prompt == expected_system_prompt
    assert settings_record.system_prompt == DEFAULT_SYSTEM_PROMPT


def test_settings_only_accepts_initial_response_provider_env(monkeypatch) -> None:
    monkeypatch.delenv("INITIAL_RESPONSE_PROVIDER", raising=False)
    monkeypatch.setenv("INITIAL_ACTIVE_PROVIDER", "anthropic")

    settings = Settings(_env_file=None)

    assert settings.initial_response_provider == "openai"

    monkeypatch.setenv("INITIAL_RESPONSE_PROVIDER", "anthropic")

    settings = Settings(_env_file=None)

    assert settings.initial_response_provider == "anthropic"


def test_settings_accepts_comma_separated_cors_allow_origins(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000, http://127.0.0.1:5173",
    )

    settings = Settings(_env_file=None)

    assert settings.cors_allow_origins == (
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    )


def test_settings_accepts_json_array_and_blank_cors_allow_origins(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        '["http://localhost:3000", "http://127.0.0.1:5173"]',
    )

    settings = Settings(_env_file=None)

    assert settings.cors_allow_origins == (
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    )

    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "   ")

    settings = Settings(_env_file=None)

    assert settings.cors_allow_origins == ()


def test_settings_resolves_storage_paths_to_absolute_runtime_paths(tmp_path) -> None:
    settings = Settings(
        _env_file=None,
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
        Settings(_env_file=None, session_ttl_hours=0)

    with pytest.raises(PydanticValidationError):
        Settings(_env_file=None, login_rate_limit_attempts=0)

    with pytest.raises(PydanticValidationError):
        Settings(_env_file=None, initial_provider_timeout_seconds=0)


def test_settings_schema_helpers_validate_and_dump_typed_models() -> None:
    profiles = parse_provider_profiles(
        {
            "openai": {
                "api_key": "openai-secret",
                "chat_model": "gpt-5.4-mini",
            }
        }
    )
    response_route = parse_response_route({"provider": "anthropic", "model": "claude-sonnet-4-5"})
    embedding_route = parse_embedding_route({"provider": "voyage", "model": "voyage-3.5"})
    vision_route = parse_vision_route({"provider": "openai", "model": "gpt-5.4"})

    assert isinstance(profiles, ProviderProfiles)
    assert isinstance(response_route, ResponseRouteConfig)
    assert isinstance(embedding_route, EmbeddingRouteConfig)
    assert isinstance(vision_route, VisionRouteConfig)

    assert dump_provider_profiles(profiles)["openai"]["chat_model"] == "gpt-5.4-mini"
    assert dump_response_route(response_route) == {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
    }
    assert dump_embedding_route(embedding_route) == {
        "provider": "voyage",
        "model": "voyage-3.5",
    }
    assert dump_vision_route(vision_route) == {"provider": "openai", "model": "gpt-5.4"}


def test_settings_schema_helpers_reject_invalid_route_payloads() -> None:
    with pytest.raises(PydanticValidationError):
        parse_response_route({"provider": "voyage", "model": "voyage-3.5"})

    with pytest.raises(PydanticValidationError):
        parse_embedding_route({"provider": "anthropic", "model": "claude-sonnet-4-5"})

    with pytest.raises(PydanticValidationError):
        parse_vision_route({"provider": "voyage", "model": "voyage-3.5"})


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
    assert from_record.response_route.provider == "openai"
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


def test_update_settings_request_validates_capability_routes() -> None:
    payload = UpdateSettingsRequest.model_validate(
        {
            "response_route": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "embedding_route": {"provider": "voyage", "model": "voyage-3.5"},
            "vision_route": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "provider_profiles": {
                "openai": {
                    "chat_model": "gpt-5.4-mini",
                    "embedding_model": "text-embedding-3-large",
                    "vision_model": "gpt-5.4-mini",
                }
            },
        }
    )

    assert payload.response_route is not None
    assert payload.embedding_route is not None
    assert payload.vision_route is not None
    assert payload.provider_profiles is not None
    assert payload.provider_profiles.openai.chat_model == "gpt-5.4-mini"


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
        json={"username": "admin", "password": "admin123456"},
    )

    response = api_client.get("/api/settings")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert "provider_profiles" in payload
    assert payload["response_route"]["provider"] == "openai"
    assert payload["embedding_route"]["provider"] == "openai"
    assert payload["vision_route"]["provider"] == "openai"
    assert payload["provider_profiles"]["openai"]["chat_model"] == "gpt-5.4"
    assert payload["provider_profiles"]["voyage"]["embedding_model"] == "voyage-3.5"


def test_chat_profile_endpoint_marks_missing_provider_configuration(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    response = api_client.get("/api/chat/profile")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["provider"] == "openai"
    assert payload["model"] == "gpt-5.4"


def test_test_routes_endpoint_returns_three_capabilities(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
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


def test_test_routes_endpoint_runs_capability_checks_in_parallel(
    api_client: TestClient,
    monkeypatch,
) -> None:
    from knowledge_chatbox_api.api.routes import settings as settings_route_module
    from knowledge_chatbox_api.providers.base import ProviderHealthResult

    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    barrier = Barrier(3, timeout=1)

    class FakeAdapter:
        def __init__(self, name: str) -> None:
            self.name = name

        def health_check(self, _settings):
            barrier.wait()
            return ProviderHealthResult(healthy=True, message=f"{self.name}:ok", latency_ms=1)

    monkeypatch.setattr(
        settings_route_module,
        "build_response_adapter",
        lambda route: FakeAdapter(f"response:{route.model}"),
    )
    monkeypatch.setattr(
        settings_route_module,
        "build_embedding_adapter",
        lambda route: FakeAdapter(f"embedding:{route.model}"),
    )
    monkeypatch.setattr(
        settings_route_module,
        "build_vision_adapter",
        lambda route: FakeAdapter(f"vision:{route.model}"),
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
