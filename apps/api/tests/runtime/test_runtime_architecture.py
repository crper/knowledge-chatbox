from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from tests.fixtures.factories import UserFactory

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.models.enums import (
    EmbeddingProvider,
    ReasoningMode,
    ResponseProvider,
    VisionProvider,
)
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ProviderRuntimeSettings,
    ResponseRouteConfig,
    VisionRouteConfig,
)
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService


def seed_admin(migrated_db_session):
    return UserFactory.persisted_create(
        migrated_db_session,
        username="admin",
        role="admin",
    )


def test_ingestion_service_builds_fresh_indexing_service_per_target_settings(
    migrated_db_session,
    monkeypatch,
) -> None:
    build_calls: list[str] = []

    def build_embedding_adapter_stub(route: dict[str, Any] | Any) -> Any:
        model = route["model"] if isinstance(route, dict) else route.model
        build_calls.append(model)
        return SimpleNamespace(model=model)

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.build_embedding_adapter",
        build_embedding_adapter_stub,
    )

    service = IngestionService(migrated_db_session, get_settings())
    first_settings = ProviderRuntimeSettings(
        provider_profiles=ProviderProfiles(),
        response_route=ResponseRouteConfig(provider=ResponseProvider.OLLAMA, model="qwen3.5:4b"),
        embedding_route=EmbeddingRouteConfig(
            provider=EmbeddingProvider.OPENAI, model="text-embedding-3-small"
        ),
        vision_route=VisionRouteConfig(provider=VisionProvider.OLLAMA, model="qwen3.5:4b"),
        system_prompt=None,
        provider_timeout_seconds=60,
        active_index_generation=1,
        reasoning_mode=ReasoningMode.DEFAULT,
    )
    second_settings = ProviderRuntimeSettings(
        provider_profiles=ProviderProfiles(),
        response_route=ResponseRouteConfig(provider=ResponseProvider.OLLAMA, model="qwen3.5:4b"),
        embedding_route=EmbeddingRouteConfig(
            provider=EmbeddingProvider.OPENAI, model="text-embedding-3-large"
        ),
        vision_route=VisionRouteConfig(provider=VisionProvider.OLLAMA, model="qwen3.5:4b"),
        system_prompt=None,
        provider_timeout_seconds=60,
        active_index_generation=1,
        reasoning_mode=ReasoningMode.DEFAULT,
    )

    first_indexing_service = service._build_indexing_service(first_settings)  # pyright: ignore[reportPrivateUsage]
    second_indexing_service = service._build_indexing_service(second_settings)  # pyright: ignore[reportPrivateUsage]

    assert first_indexing_service is not second_indexing_service
    assert first_indexing_service.settings is first_settings
    assert second_indexing_service.settings is second_settings
    assert first_indexing_service.embedding_provider.model == "text-embedding-3-small"  # pyright: ignore[reportAttributeAccessIssue]
    assert second_indexing_service.embedding_provider.model == "text-embedding-3-large"  # pyright: ignore[reportAttributeAccessIssue]
    assert build_calls == ["text-embedding-3-small", "text-embedding-3-large"]
