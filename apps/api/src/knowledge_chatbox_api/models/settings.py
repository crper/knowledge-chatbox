"""设置数据模型定义。"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from knowledge_chatbox_api.db.base import Base
from knowledge_chatbox_api.models.enums import IndexRebuildStatus, ProviderName, SettingsScopeType
from knowledge_chatbox_api.schemas.settings import (  # noqa: E402 — 模型层依赖 schema 层的 JSON 序列化/反序列化函数，待后续重构解耦
    EmbeddingRouteConfig,
    ProviderProfiles,
    ResponseRouteConfig,
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

DEFAULT_PROVIDER_PROFILES = {
    "openai": {
        "api_key": None,
        "base_url": "https://api.openai.com/v1",
        "chat_model": "gpt-5.4",
        "embedding_model": "text-embedding-3-small",
        "vision_model": "gpt-5.4",
    },
    "anthropic": {
        "api_key": None,
        "base_url": "https://api.anthropic.com",
        "chat_model": "claude-sonnet-4-5",
        "vision_model": "claude-sonnet-4-5",
    },
    "voyage": {
        "api_key": None,
        "base_url": "https://api.voyageai.com/v1",
        "embedding_model": "voyage-3.5",
    },
    "ollama": {
        "base_url": "http://localhost:11434",
        "chat_model": "qwen3.5:4b",
        "embedding_model": "nomic-embed-text",
        "vision_model": "qwen3.5:4b",
    },
}

DEFAULT_RESPONSE_ROUTE = {"provider": ProviderName.OLLAMA, "model": "qwen3.5:4b"}
DEFAULT_EMBEDDING_ROUTE = {"provider": ProviderName.OLLAMA, "model": "nomic-embed-text"}
DEFAULT_VISION_ROUTE = {"provider": ProviderName.OLLAMA, "model": "qwen3.5:4b"}


class AppSettings(Base):
    """定义应用设置数据模型。"""

    __tablename__ = "app_settings"
    __table_args__ = (
        Index("uq_app_settings_scope", "scope_type", "scope_id", unique=True),
        CheckConstraint(
            "scope_type IN ('global', 'workspace')",
            name="ck_app_settings_scope_type",
        ),
        CheckConstraint(
            "index_rebuild_status IN ('idle', 'running', 'failed')",
            name="ck_app_settings_index_rebuild_status",
        ),
        CheckConstraint(
            "provider_timeout_seconds > 0",
            name="ck_app_settings_provider_timeout_seconds",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scope_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=SettingsScopeType.GLOBAL,
    )
    scope_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=SettingsScopeType.GLOBAL,
    )
    provider_profiles_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: dump_provider_profiles(DEFAULT_PROVIDER_PROFILES),
    )
    response_route_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: dump_response_route(DEFAULT_RESPONSE_ROUTE),
    )
    embedding_route_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: dump_embedding_route(DEFAULT_EMBEDDING_ROUTE),
    )
    pending_embedding_route_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    vision_route_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: dump_vision_route(DEFAULT_VISION_ROUTE),
    )
    system_prompt: Mapped[str | None] = mapped_column(Text)
    provider_timeout_seconds: Mapped[int] = mapped_column(nullable=False, default=60)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    active_index_generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    building_index_generation: Mapped[int | None] = mapped_column(Integer)
    index_rebuild_status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=IndexRebuildStatus.IDLE,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def provider_profiles(self) -> ProviderProfiles:
        return parse_provider_profiles(self.provider_profiles_json or {})

    @property
    def response_route(self) -> ResponseRouteConfig:
        return parse_response_route(self.response_route_json or {})

    @property
    def embedding_route(self) -> EmbeddingRouteConfig:
        return parse_embedding_route(self.embedding_route_json or {})

    @property
    def vision_route(self) -> VisionRouteConfig:
        return parse_vision_route(self.vision_route_json or {})

    @property
    def pending_embedding_route(self) -> EmbeddingRouteConfig | None:
        if self.pending_embedding_route_json is None:
            return None
        return parse_embedding_route(self.pending_embedding_route_json)

    @property
    def response_provider(self) -> str | None:
        return self.response_route.provider

    @property
    def response_model(self) -> str | None:
        return self.response_route.model

    @property
    def embedding_provider(self) -> str | None:
        return self.embedding_route.provider

    @property
    def embedding_model(self) -> str | None:
        return self.embedding_route.model

    @property
    def vision_provider(self) -> str | None:
        return self.vision_route.provider

    @property
    def vision_model(self) -> str | None:
        return self.vision_route.model
