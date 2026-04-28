"""Runtime settings contract for provider-facing service code.

通过 SettingsSource Protocol 描述 settings 数据源的接口契约，
替代之前的 Any 类型参数，确保类型安全。

注意：SQLAlchemy 的 Mapped[T] 类型与 Protocol 属性类型不兼容，
因此 Protocol 中使用 @property 的返回类型需要兼容 Mapped[T] 的运行时值。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, cast, runtime_checkable

from knowledge_chatbox_api.models.enums import ProviderName, ReasoningMode
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ProviderRuntimeSettings,
    ResponseRouteConfig,
    VisionRouteConfig,
    parse_embedding_route,
    parse_provider_profiles,
    parse_provider_runtime_settings,
    parse_response_route,
    parse_vision_route,
)

if TYPE_CHECKING:
    from knowledge_chatbox_api.models.settings import AppSettings
    from knowledge_chatbox_api.schemas.settings import SettingsRead


@runtime_checkable
class SettingsSource(Protocol):
    """settings 数据源的接口契约。

    AppSettings ORM 模型和 SettingsRead Pydantic 模型均满足此协议。
    使用 Protocol 替代 Any，让类型检查器在调用点验证属性访问。
    """

    @property
    def provider_profiles(self) -> ProviderProfiles: ...
    @property
    def response_route(self) -> ResponseRouteConfig: ...
    @property
    def embedding_route(self) -> EmbeddingRouteConfig: ...
    @property
    def vision_route(self) -> VisionRouteConfig: ...
    @property
    def system_prompt(self) -> str | None: ...
    @property
    def provider_timeout_seconds(self) -> int: ...
    @property
    def active_index_generation(self) -> int: ...
    @property
    def pending_embedding_route(self) -> EmbeddingRouteConfig | None: ...


DEFAULT_RESPONSE_ROUTE = {"provider": ProviderName.OLLAMA, "model": "qwen3.5:4b"}
DEFAULT_EMBEDDING_ROUTE = {"provider": ProviderName.OLLAMA, "model": "nomic-embed-text"}
DEFAULT_VISION_ROUTE = {"provider": ProviderName.OLLAMA, "model": "qwen3.5:4b"}
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 60


def _build_from_source(
    value: AppSettings | SettingsRead,
    *,
    embedding_route: EmbeddingRouteConfig | dict[str, str] | None = None,
    reasoning_mode: ReasoningMode | None = None,
) -> ProviderRuntimeSettings:
    return ProviderRuntimeSettings(
        provider_profiles=parse_provider_profiles(value.provider_profiles),
        response_route=parse_response_route(value.response_route),
        embedding_route=parse_embedding_route(
            embedding_route if embedding_route is not None else value.embedding_route
        ),
        vision_route=parse_vision_route(value.vision_route),
        system_prompt=value.system_prompt,
        provider_timeout_seconds=value.provider_timeout_seconds,
        active_index_generation=value.active_index_generation,
        reasoning_mode=reasoning_mode if reasoning_mode is not None else ReasoningMode.DEFAULT,
    )


def parse_runtime_settings(value: object) -> ProviderRuntimeSettings:
    """收紧任意 runtime settings 输入为统一强类型模型。"""
    try:
        return parse_provider_runtime_settings(value)
    except Exception:
        if isinstance(value, SettingsSource):
            return _build_from_source(cast("AppSettings | SettingsRead", value))
        raise


def build_runtime_settings(
    settings_source: AppSettings | SettingsRead,
    *,
    embedding_route: EmbeddingRouteConfig | dict[str, str] | None = None,
    reasoning_mode: ReasoningMode | None = None,
) -> ProviderRuntimeSettings:
    """从 AppSettings 或 SettingsRead 构造 provider 运行时所需的统一配置。"""
    return _build_from_source(
        settings_source,
        embedding_route=embedding_route,
        reasoning_mode=reasoning_mode,
    )


def build_embedding_settings(
    settings_record: AppSettings | SettingsRead,
    *,
    use_pending: bool,
) -> ProviderRuntimeSettings:
    """根据 pending 标志选择 embedding route 并构建运行时设置。"""
    effective_route = (
        settings_record.pending_embedding_route if use_pending else settings_record.embedding_route
    )
    return build_runtime_settings(
        settings_record,
        embedding_route=effective_route,
    )
