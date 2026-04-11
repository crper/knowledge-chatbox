"""Settings persistence and capability bootstrap logic."""

from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from sqlalchemy import func, update

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.enums import (
    IndexRebuildStatus,
    ProviderName,
    ReasoningMode,
    SettingsScopeType,
    UserRole,
)
from knowledge_chatbox_api.models.settings import (
    DEFAULT_PROVIDER_PROFILES,
    AppSettings,
    SettingsVersion,
)
from knowledge_chatbox_api.providers.ollama_url import normalize_ollama_base_url
from knowledge_chatbox_api.repositories.settings_repository import (
    SettingsRepository,
    SettingsVersionRepository,
)
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ProviderRuntimeSettings,
    ResponseRouteConfig,
    SettingsRead,
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
from knowledge_chatbox_api.services.auth.auth_service import ValidationError
from knowledge_chatbox_api.services.auth.user_service import AuthorizationError
from knowledge_chatbox_api.services.settings.runtime_settings import build_runtime_settings
from knowledge_chatbox_api.utils.helpers import strip_or_none, unwrap_secret

DEFAULT_SYSTEM_PROMPT = (
    "你是 Knowledge Chatbox 的知识工作台助手。\n"
    "你的首要任务是基于当前问题、当前会话历史和当前检索到的资料，给出准确、简洁、可执行的回答。\n"
    "先回答用户真正的问题，先给结论，再给依据；如果有必要，再补下一步建议。\n"
    "优先使用资料事实，不要编造未在上下文中出现的信息；如果用了推断或通用经验，必须明确标注。\n"
    "当资料不足以支撑结论时，要明确说明资料不足，并提出一个最小必要的补充问题。\n"
    "对实现、排障、配置类问题，优先给步骤、判断顺序和可执行建议，不要先写大段背景介绍。\n"
    "不要输出营销话术、寒暄铺垫或重复用户问题。\n"
    "永远回复中文。"
)

MASKED_SECRET_VALUE = "********"  # noqa: S105
PROFILE_SECRET_FIELDS: dict[ProviderName, tuple[str, ...]] = {
    ProviderName.OPENAI: ("api_key",),
    ProviderName.ANTHROPIC: ("api_key",),
    ProviderName.VOYAGE: ("api_key",),
    ProviderName.OLLAMA: (),
}


class SettingsService:
    """Manage instance settings and compute whether reindexing is required."""

    def __init__(self, session, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.repository = SettingsRepository(session)
        self.version_repository = SettingsVersionRepository(session)
        self._settings_record_cache: AppSettings | None = None  # 实例级缓存，仅在同一请求内复用

    def get_or_create_settings(self) -> SettingsRead:
        settings_record = self.get_or_create_settings_record()
        return self._to_read(settings_record)

    def get_runtime_settings(
        self,
        *,
        reasoning_mode: ReasoningMode = ReasoningMode.DEFAULT,
    ) -> ProviderRuntimeSettings:
        """返回当前生效设置对应的统一 runtime settings。"""
        settings_record = self.get_or_create_settings_record()
        return build_runtime_settings(settings_record, reasoning_mode=reasoning_mode)

    def build_test_settings_bundle(
        self,
        actor: User,
        payload: UpdateSettingsRequest | Mapping[str, Any],
        *,
        reasoning_mode: ReasoningMode = ReasoningMode.DEFAULT,
    ) -> tuple[SettingsRead, ProviderRuntimeSettings]:
        """返回测试连接所需的 draft read model 与 runtime settings。"""
        draft = self.build_test_settings(actor, payload)
        embedding_route = draft.pending_embedding_route or draft.embedding_route
        return (
            draft,
            build_runtime_settings(
                draft,
                embedding_route=embedding_route,
                reasoning_mode=reasoning_mode,
            ),
        )

    def get_or_create_settings_record(self) -> AppSettings:
        if self._settings_record_cache is not None:
            return self._settings_record_cache

        cached_id = self.repository.get_cached_id()
        if cached_id is not None:
            settings_record = self.session.get(AppSettings, cached_id)
            if settings_record is not None:
                self._settings_record_cache = settings_record
                return settings_record

        settings_record = self.repository.get_settings()
        if settings_record is None:
            settings_record = self._build_initial_settings_record()
            self.repository.save(settings_record)
            self.session.flush()
            self.session.refresh(settings_record)
            self._append_settings_version(
                settings_record,
                trigger="bootstrap",
                updated_by_user_id=None,
                changed_fields=None,
            )
            self.session.commit()
            self.session.refresh(settings_record)
        self._settings_record_cache = settings_record
        self.repository.set_cached_id(settings_record.id)
        return settings_record

    def update_settings(
        self,
        actor: User,
        payload: UpdateSettingsRequest | Mapping[str, Any],
    ) -> SettingsRead:
        """更新系统设置，并在 embedding route 变更时标记重建。"""
        if actor.role != UserRole.ADMIN:
            raise AuthorizationError("Admin permission required.")

        update_request = self._normalize_update_request(payload)
        settings_record = self.get_or_create_settings_record()
        previous_version_snapshot = self._build_version_snapshot(settings_record)

        previous_effective_embedding_route = self._effective_embedding_route(settings_record)
        (
            next_profiles,
            next_response_route,
            requested_embedding_route,
            next_vision_route,
        ) = self._resolve_requested_routes(
            settings_record,
            update_request,
            embedding_route_fallback=previous_effective_embedding_route,
        )

        settings_record.provider_profiles_json = dump_provider_profiles(next_profiles)
        settings_record.response_route_json = dump_response_route(next_response_route)
        settings_record.vision_route_json = dump_vision_route(next_vision_route)
        if "system_prompt" in update_request.model_fields_set:
            settings_record.system_prompt = update_request.system_prompt
        resolved_timeout = self._resolve_provider_timeout_seconds(settings_record, update_request)
        settings_record.provider_timeout_seconds = resolved_timeout

        rebuild_started = False
        reindex_required = False
        if requested_embedding_route != previous_effective_embedding_route:
            settings_record.pending_embedding_route_json = dump_embedding_route(
                requested_embedding_route
            )
            increment_statement = (
                update(AppSettings)
                .where(AppSettings.id == settings_record.id)
                .values(
                    building_index_generation=func.coalesce(
                        AppSettings.building_index_generation,
                        AppSettings.active_index_generation,
                    )
                    + 1,
                    index_rebuild_status=IndexRebuildStatus.RUNNING,
                )
            )
            self.session.execute(increment_statement)
            rebuild_started = True
            reindex_required = True

        settings_record.updated_by_user_id = actor.id
        self.session.flush()
        self.session.refresh(settings_record)
        next_version_snapshot = self._build_version_snapshot(settings_record)
        changed_fields = self._changed_version_fields(
            previous_version_snapshot,
            next_version_snapshot,
        )
        if changed_fields:
            self._append_settings_version(
                settings_record,
                trigger="update",
                updated_by_user_id=actor.id,
                changed_fields=changed_fields,
            )
        self.session.commit()
        self.session.refresh(settings_record)
        self._settings_record_cache = settings_record
        self.repository.invalidate_id_cache()
        return self._to_read(
            settings_record,
            rebuild_started=rebuild_started,
            reindex_required=reindex_required,
        )

    def build_test_settings(
        self,
        actor: User,
        payload: UpdateSettingsRequest | Mapping[str, Any],
    ) -> SettingsRead:
        """构造一次仅用于 capability 连接测试的临时设置。"""
        if actor.role != UserRole.ADMIN:
            raise AuthorizationError("Admin permission required.")

        update_request = self._normalize_update_request(payload)
        settings_record = self.get_or_create_settings_record()
        provider_profiles, response_route, embedding_route, vision_route = (
            self._resolve_requested_routes(
                settings_record,
                update_request,
                embedding_route_fallback=self._effective_embedding_route(settings_record),
            )
        )

        return SettingsRead(
            id=settings_record.id,
            provider_profiles=ProviderProfiles.model_validate(
                self._masked_provider_profiles(provider_profiles)
            ),
            response_route=response_route,
            embedding_route=settings_record.embedding_route,
            pending_embedding_route=embedding_route,
            vision_route=vision_route,
            system_prompt=self._resolve_system_prompt(settings_record, update_request),
            provider_timeout_seconds=self._resolve_provider_timeout_seconds(
                settings_record,
                update_request,
            ),
            updated_by_user_id=settings_record.updated_by_user_id,
            updated_at=settings_record.updated_at,
            active_index_generation=settings_record.active_index_generation,
            building_index_generation=settings_record.building_index_generation,
            index_rebuild_status=IndexRebuildStatus(settings_record.index_rebuild_status),
        )

    def _build_initial_settings_record(self) -> AppSettings:
        provider_profiles = deepcopy(DEFAULT_PROVIDER_PROFILES)
        provider_profiles["openai"]["api_key"] = unwrap_secret(self.settings.initial_openai_api_key)
        provider_profiles["openai"]["base_url"] = self.settings.initial_openai_base_url
        provider_profiles["openai"]["chat_model"] = self.settings.initial_openai_chat_model
        provider_profiles["openai"]["embedding_model"] = (
            self.settings.initial_openai_embedding_model
        )
        provider_profiles["openai"]["vision_model"] = self.settings.initial_openai_vision_model
        provider_profiles["anthropic"]["api_key"] = unwrap_secret(
            self.settings.initial_anthropic_api_key
        )
        provider_profiles["anthropic"]["base_url"] = self.settings.initial_anthropic_base_url
        provider_profiles["anthropic"]["chat_model"] = self.settings.initial_anthropic_chat_model
        provider_profiles["anthropic"]["vision_model"] = (
            self.settings.initial_anthropic_vision_model
        )
        provider_profiles["voyage"]["api_key"] = unwrap_secret(self.settings.initial_voyage_api_key)
        provider_profiles["voyage"]["base_url"] = self.settings.initial_voyage_base_url
        provider_profiles["voyage"]["embedding_model"] = (
            self.settings.initial_voyage_embedding_model
        )
        provider_profiles["ollama"]["base_url"] = normalize_ollama_base_url(
            self.settings.initial_ollama_base_url
        )
        provider_profiles["ollama"]["chat_model"] = self.settings.initial_ollama_chat_model
        provider_profiles["ollama"]["embedding_model"] = (
            self.settings.initial_ollama_embedding_model
        )
        provider_profiles["ollama"]["vision_model"] = self.settings.initial_ollama_vision_model

        response_provider = self.settings.initial_response_provider
        embedding_provider = self.settings.initial_embedding_provider
        vision_provider = self.settings.initial_vision_provider

        return AppSettings(
            scope_type=SettingsScopeType.GLOBAL,
            scope_id=SettingsScopeType.GLOBAL,
            provider_profiles_json=provider_profiles,
            response_route_json=dump_response_route(
                self._normalize_response_route(
                    {
                        "provider": response_provider,
                        "model": self._profile_model(
                            provider_profiles,
                            response_provider,
                            "chat_model",
                            fallback=self.settings.initial_response_model,
                        ),
                    }
                )
            ),
            embedding_route_json=dump_embedding_route(
                self._normalize_embedding_route(
                    {
                        "provider": embedding_provider,
                        "model": self._profile_model(
                            provider_profiles,
                            embedding_provider,
                            "embedding_model",
                            fallback=self.settings.initial_embedding_model,
                        ),
                    }
                )
            ),
            pending_embedding_route_json=None,
            vision_route_json=dump_vision_route(
                self._normalize_vision_route(
                    {
                        "provider": vision_provider,
                        "model": self._profile_model(
                            provider_profiles,
                            vision_provider,
                            "vision_model",
                            fallback=self.settings.initial_vision_model,
                        ),
                    }
                )
            ),
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            provider_timeout_seconds=self.settings.initial_provider_timeout_seconds,
            active_index_generation=1,
            building_index_generation=None,
            index_rebuild_status=IndexRebuildStatus.IDLE,
        )

    def _normalize_update_request(
        self,
        payload: UpdateSettingsRequest | Mapping[str, Any],
    ) -> UpdateSettingsRequest:
        if isinstance(payload, UpdateSettingsRequest):
            return payload
        return UpdateSettingsRequest.model_validate(payload)

    def _resolve_requested_routes(
        self,
        settings_record: AppSettings,
        update_request: UpdateSettingsRequest,
        *,
        embedding_route_fallback: EmbeddingRouteConfig,
    ) -> tuple[
        ProviderProfiles,
        ResponseRouteConfig,
        EmbeddingRouteConfig,
        VisionRouteConfig,
    ]:
        provider_profiles = self._merge_provider_profiles(
            settings_record.provider_profiles,
            update_request.provider_profiles,
        )
        response_route = self._normalize_response_route(
            update_request.response_route or settings_record.response_route
        )
        embedding_route = self._normalize_embedding_route(
            update_request.embedding_route or embedding_route_fallback
        )
        vision_route = self._normalize_vision_route(
            update_request.vision_route or settings_record.vision_route
        )
        provider_profiles = self._sync_route_models_to_profiles(
            provider_profiles,
            response_route=response_route,
            embedding_route=embedding_route,
            vision_route=vision_route,
        )
        return provider_profiles, response_route, embedding_route, vision_route

    def _resolve_provider_timeout_seconds(
        self,
        settings_record: AppSettings,
        update_request: UpdateSettingsRequest,
    ) -> int:
        if (
            "provider_timeout_seconds" in update_request.model_fields_set
            and update_request.provider_timeout_seconds is not None
        ):
            return update_request.provider_timeout_seconds
        return settings_record.provider_timeout_seconds

    def _resolve_system_prompt(
        self,
        settings_record: AppSettings,
        update_request: UpdateSettingsRequest,
    ) -> str | None:
        if "system_prompt" in update_request.model_fields_set:
            return update_request.system_prompt
        return settings_record.system_prompt

    def _merge_provider_profiles(
        self,
        current: ProviderProfiles | Mapping[str, Any] | None,
        incoming: ProviderProfiles | None,
    ) -> ProviderProfiles:
        """在保持已有 secret 的前提下合并 provider profile 更新。"""
        merged = self._normalized_provider_profiles(current)
        if incoming is None:
            return parse_provider_profiles(merged)
        for provider_name, provider_payload in dump_provider_profiles(
            incoming,
            exclude_none=True,
        ).items():
            provider_state = merged.setdefault(provider_name, {})
            for field, value in provider_payload.items():
                if value == MASKED_SECRET_VALUE:
                    continue
                provider_state[field] = value
        return parse_provider_profiles(merged)

    def _normalized_provider_profiles(
        self,
        current: ProviderProfiles | Mapping[str, Any] | None,
    ) -> dict[str, dict[str, Any]]:
        normalized: dict[str, dict[str, Any]] = deepcopy(DEFAULT_PROVIDER_PROFILES)
        for provider_name, provider_payload in dump_provider_profiles(current or {}).items():
            if not isinstance(provider_payload, dict):
                continue
            normalized.setdefault(provider_name, {}).update(provider_payload)
        normalized["ollama"]["base_url"] = normalize_ollama_base_url(
            normalized["ollama"].get("base_url")
        )
        return normalized

    def _sync_route_models_to_profiles(
        self,
        profiles: ProviderProfiles | Mapping[str, Any],
        *,
        response_route: ResponseRouteConfig,
        embedding_route: EmbeddingRouteConfig,
        vision_route: VisionRouteConfig,
    ) -> ProviderProfiles:
        synced = self._normalized_provider_profiles(profiles)
        synced.setdefault(response_route.provider, {})["chat_model"] = response_route.model
        synced.setdefault(embedding_route.provider, {})["embedding_model"] = embedding_route.model
        synced.setdefault(vision_route.provider, {})["vision_model"] = vision_route.model
        return parse_provider_profiles(synced)

    def _profile_model(
        self,
        profiles: dict[str, dict[str, Any]],
        provider: str,
        field: str,
        *,
        fallback: str,
    ) -> str:
        value = profiles.get(provider, {}).get(field)
        return strip_or_none(value) or fallback

    def _masked_provider_profiles(
        self,
        profiles: ProviderProfiles | Mapping[str, Any],
    ) -> dict[str, Any]:
        masked = dump_provider_profiles(profiles)
        for provider_name, secret_fields in PROFILE_SECRET_FIELDS.items():
            provider_profile = masked.setdefault(provider_name.value, {})
            for field in secret_fields:
                if provider_profile.get(field):
                    provider_profile[field] = MASKED_SECRET_VALUE
        return masked

    def _normalize_route(
        self,
        route,
        parse_fn,
        route_cls,
        error_msg: str,
    ):
        normalized = parse_fn(route)
        if not normalized.model.strip():
            raise ValidationError(error_msg)
        return route_cls(
            provider=normalized.provider,
            model=normalized.model.strip(),
        )

    def _normalize_response_route(
        self,
        route: ResponseRouteConfig | Mapping[str, Any],
    ) -> ResponseRouteConfig:
        return self._normalize_route(
            route, parse_response_route, ResponseRouteConfig, "Invalid response route model."
        )

    def _normalize_embedding_route(
        self,
        route: EmbeddingRouteConfig | Mapping[str, Any],
    ) -> EmbeddingRouteConfig:
        return self._normalize_route(
            route, parse_embedding_route, EmbeddingRouteConfig, "Invalid embedding route model."
        )

    def _normalize_vision_route(
        self,
        route: VisionRouteConfig | Mapping[str, Any],
    ) -> VisionRouteConfig:
        return self._normalize_route(
            route, parse_vision_route, VisionRouteConfig, "Invalid vision route model."
        )

    def _effective_embedding_route(
        self,
        settings_record: AppSettings,
    ) -> EmbeddingRouteConfig:
        return settings_record.pending_embedding_route or settings_record.embedding_route

    def _build_version_snapshot(
        self,
        settings_record: AppSettings,
    ) -> dict[str, Any]:
        read_model = self._to_read(settings_record)
        return {
            "provider_profiles": read_model.provider_profiles.model_dump(),
            "response_route": read_model.response_route.model_dump(),
            "embedding_route": read_model.embedding_route.model_dump(),
            "pending_embedding_route": (
                read_model.pending_embedding_route.model_dump()
                if read_model.pending_embedding_route is not None
                else None
            ),
            "vision_route": read_model.vision_route.model_dump(),
            "system_prompt": read_model.system_prompt,
            "provider_timeout_seconds": read_model.provider_timeout_seconds,
            "active_index_generation": read_model.active_index_generation,
            "building_index_generation": read_model.building_index_generation,
            "index_rebuild_status": read_model.index_rebuild_status.value,
        }

    def _changed_version_fields(
        self,
        previous_snapshot: Mapping[str, Any],
        next_snapshot: Mapping[str, Any],
    ) -> list[str]:
        all_keys = sorted(set(previous_snapshot) | set(next_snapshot))
        return [key for key in all_keys if previous_snapshot.get(key) != next_snapshot.get(key)]

    def _append_settings_version(
        self,
        settings_record: AppSettings,
        *,
        trigger: str,
        updated_by_user_id: int | None,
        changed_fields: list[str] | None,
    ) -> SettingsVersion:
        version = SettingsVersion(
            settings_id=settings_record.id,
            version_no=self.version_repository.next_version_no(settings_record.id),
            snapshot_json=self._build_version_snapshot(settings_record),
            changed_fields_json=changed_fields,
            trigger=trigger,
            updated_by_user_id=updated_by_user_id,
        )
        return self.version_repository.save(version)

    def _to_read(
        self,
        settings_record: AppSettings,
        *,
        rebuild_started: bool = False,
        reindex_required: bool = False,
    ) -> SettingsRead:
        provider_profiles = self._sync_route_models_to_profiles(
            settings_record.provider_profiles,
            response_route=settings_record.response_route,
            embedding_route=self._effective_embedding_route(settings_record),
            vision_route=settings_record.vision_route,
        )
        return SettingsRead(
            id=settings_record.id,
            provider_profiles=ProviderProfiles.model_validate(
                self._masked_provider_profiles(provider_profiles)
            ),
            response_route=settings_record.response_route,
            embedding_route=settings_record.embedding_route,
            pending_embedding_route=settings_record.pending_embedding_route,
            vision_route=settings_record.vision_route,
            system_prompt=settings_record.system_prompt,
            provider_timeout_seconds=settings_record.provider_timeout_seconds,
            updated_by_user_id=settings_record.updated_by_user_id,
            updated_at=settings_record.updated_at,
            active_index_generation=settings_record.active_index_generation,
            building_index_generation=settings_record.building_index_generation,
            index_rebuild_status=IndexRebuildStatus(settings_record.index_rebuild_status),
            rebuild_started=rebuild_started,
            reindex_required=reindex_required,
        )
