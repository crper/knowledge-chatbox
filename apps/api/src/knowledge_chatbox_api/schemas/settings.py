"""设置 Pydantic 模型定义。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from knowledge_chatbox_api.schemas._validators import (
    EmbeddingProviderLiteral,
    PositiveInt,
    ReasoningModeLiteral,
    ResponseProviderLiteral,
    VisionProviderLiteral,
)


class ResponseRouteConfig(BaseModel):
    """描述 response capability route。"""

    provider: ResponseProviderLiteral
    model: str


class EmbeddingRouteConfig(BaseModel):
    """描述 embedding capability route。"""

    provider: EmbeddingProviderLiteral
    model: str


class VisionRouteConfig(BaseModel):
    """描述 vision capability route。"""

    provider: VisionProviderLiteral
    model: str


class OpenAIProfile(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    chat_model: str | None = None
    embedding_model: str | None = None
    vision_model: str | None = None


class AnthropicProfile(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    chat_model: str | None = None
    vision_model: str | None = None


class VoyageProfile(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    embedding_model: str | None = None


class OllamaProfile(BaseModel):
    base_url: str | None = None
    chat_model: str | None = None
    embedding_model: str | None = None
    vision_model: str | None = None


class ProviderProfiles(BaseModel):
    """描述全部 provider profile。"""

    openai: OpenAIProfile = Field(default_factory=OpenAIProfile)
    anthropic: AnthropicProfile = Field(default_factory=AnthropicProfile)
    voyage: VoyageProfile = Field(default_factory=VoyageProfile)
    ollama: OllamaProfile = Field(default_factory=OllamaProfile)


class CapabilityHealthRead(BaseModel):
    """描述单个 capability 健康结果。"""

    provider: str
    model: str
    healthy: bool
    message: str
    latency_ms: int | None = None


class ProviderConnectionTestRead(BaseModel):
    """描述 capability 健康检查响应。"""

    response: CapabilityHealthRead
    embedding: CapabilityHealthRead
    vision: CapabilityHealthRead


class SettingsRead(BaseModel):
    """描述设置响应体。"""

    id: int
    provider_profiles: ProviderProfiles
    response_route: ResponseRouteConfig
    embedding_route: EmbeddingRouteConfig
    pending_embedding_route: EmbeddingRouteConfig | None = None
    vision_route: VisionRouteConfig
    system_prompt: str | None
    provider_timeout_seconds: PositiveInt
    updated_by_user_id: int | None
    updated_at: datetime
    active_index_generation: int
    building_index_generation: int | None
    index_rebuild_status: str
    rebuild_started: bool = False
    reindex_required: bool = False


class UpdateSettingsRequest(BaseModel):
    """描述更新设置请求。"""

    provider_profiles: ProviderProfiles | None = None
    response_route: ResponseRouteConfig | None = None
    embedding_route: EmbeddingRouteConfig | None = None
    vision_route: VisionRouteConfig | None = None
    system_prompt: str | None = None
    provider_timeout_seconds: PositiveInt | None = None


class ProviderRuntimeSettings(BaseModel):
    """Provider 适配器运行时所需的最小强类型设置。"""

    model_config = ConfigDict(frozen=True)

    provider_profiles: ProviderProfiles
    response_route: ResponseRouteConfig
    embedding_route: EmbeddingRouteConfig
    vision_route: VisionRouteConfig
    system_prompt: str | None = None
    provider_timeout_seconds: PositiveInt
    active_index_generation: PositiveInt | None = None
    reasoning_mode: ReasoningModeLiteral = "default"


class ProviderRuntimeSettingsSource(Protocol):
    """构造 ProviderRuntimeSettings 所需的最小 settings 协议。"""

    @property
    def provider_profiles(self) -> ProviderProfiles | dict[str, Any]: ...

    @property
    def response_route(self) -> ResponseRouteConfig | dict[str, Any]: ...

    @property
    def embedding_route(self) -> EmbeddingRouteConfig | dict[str, Any]: ...

    @property
    def vision_route(self) -> VisionRouteConfig | dict[str, Any]: ...

    @property
    def system_prompt(self) -> str | None: ...

    @property
    def provider_timeout_seconds(self) -> PositiveInt: ...

    @property
    def active_index_generation(self) -> PositiveInt | None: ...


_PROVIDER_PROFILES_ADAPTER = TypeAdapter(ProviderProfiles)
_RESPONSE_ROUTE_ADAPTER = TypeAdapter(ResponseRouteConfig)
_EMBEDDING_ROUTE_ADAPTER = TypeAdapter(EmbeddingRouteConfig)
_VISION_ROUTE_ADAPTER = TypeAdapter(VisionRouteConfig)
_PROVIDER_RUNTIME_SETTINGS_ADAPTER = TypeAdapter(ProviderRuntimeSettings)


def parse_provider_profiles(value: object) -> ProviderProfiles:
    """把 provider profile JSON 或模型收紧为统一类型。"""
    return _PROVIDER_PROFILES_ADAPTER.validate_python(value)


def dump_provider_profiles(
    value: object,
    *,
    exclude_none: bool = False,
) -> dict[str, Any]:
    """把 provider profile 模型稳定导出为 JSON 兼容字典。"""
    return parse_provider_profiles(value).model_dump(exclude_none=exclude_none)


def parse_response_route(value: object) -> ResponseRouteConfig:
    """把 response route JSON 或模型收紧为统一类型。"""
    return _RESPONSE_ROUTE_ADAPTER.validate_python(value)


def dump_response_route(value: object) -> dict[str, Any]:
    """把 response route 模型稳定导出为 JSON 兼容字典。"""
    return parse_response_route(value).model_dump()


def parse_embedding_route(value: object) -> EmbeddingRouteConfig:
    """把 embedding route JSON 或模型收紧为统一类型。"""
    return _EMBEDDING_ROUTE_ADAPTER.validate_python(value)


def dump_embedding_route(value: object) -> dict[str, Any]:
    """把 embedding route 模型稳定导出为 JSON 兼容字典。"""
    return parse_embedding_route(value).model_dump()


def parse_vision_route(value: object) -> VisionRouteConfig:
    """把 vision route JSON 或模型收紧为统一类型。"""
    return _VISION_ROUTE_ADAPTER.validate_python(value)


def dump_vision_route(value: object) -> dict[str, Any]:
    """把 vision route 模型稳定导出为 JSON 兼容字典。"""
    return parse_vision_route(value).model_dump()


def parse_provider_runtime_settings(value: object) -> ProviderRuntimeSettings:
    """把运行时 provider 设置收紧为统一类型。"""
    return _PROVIDER_RUNTIME_SETTINGS_ADAPTER.validate_python(value)
