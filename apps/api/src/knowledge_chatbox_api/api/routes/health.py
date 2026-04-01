"""健康检查路由定义。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from knowledge_chatbox_api.api.deps import AdminUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter_from_settings,
    build_response_adapter_from_settings,
    build_vision_adapter_from_settings,
)
from knowledge_chatbox_api.providers.health import run_parallel_checks
from knowledge_chatbox_api.schemas.common import Envelope
from knowledge_chatbox_api.schemas.settings import (
    CapabilityHealthRead,
    build_provider_runtime_settings,
)
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.utils.settings_helpers import to_capability_health

router = APIRouter(tags=["health"])


class HealthData(BaseModel):
    status: str


class CapabilityHealthData(BaseModel):
    response: CapabilityHealthRead
    embedding: CapabilityHealthRead
    vision: CapabilityHealthRead


@router.get("/api/health", response_model=Envelope[HealthData])
def health() -> Envelope[HealthData]:
    return Envelope(success=True, data=HealthData(status="ok"), error=None)


@router.get("/api/health/capabilities", response_model=Envelope[CapabilityHealthData])
def capability_health(
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: AdminUserDep,
) -> Envelope[CapabilityHealthData]:
    del current_user
    settings_record = SettingsService(session, settings).get_or_create_settings_record()
    runtime_settings = build_provider_runtime_settings(settings_record)
    results = run_parallel_checks(
        {
            "response": lambda: build_response_adapter_from_settings(runtime_settings).health_check(
                runtime_settings
            ),
            "embedding": lambda: build_embedding_adapter_from_settings(
                runtime_settings
            ).health_check(runtime_settings),
            "vision": lambda: build_vision_adapter_from_settings(runtime_settings).health_check(
                runtime_settings
            ),
        }
    )
    return Envelope(
        success=True,
        data=CapabilityHealthData(
            response=to_capability_health(results["response"], settings_record.response_route),
            embedding=to_capability_health(results["embedding"], settings_record.embedding_route),
            vision=to_capability_health(results["vision"], settings_record.vision_route),
        ),
        error=None,
    )
