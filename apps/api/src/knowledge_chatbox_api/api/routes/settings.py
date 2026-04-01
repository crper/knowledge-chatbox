"""设置路由定义。"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Body

from knowledge_chatbox_api.api.deps import AdminUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.api.error_responses import ADMIN_ROUTE_ERROR_RESPONSES
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_response_adapter,
    build_vision_adapter,
)
from knowledge_chatbox_api.providers.health import run_parallel_checks
from knowledge_chatbox_api.schemas.common import Envelope
from knowledge_chatbox_api.schemas.settings import (
    ProviderConnectionTestRead,
    SettingsRead,
    UpdateSettingsRequest,
    build_provider_runtime_settings,
)
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.tasks import document_jobs
from knowledge_chatbox_api.utils.settings_helpers import to_capability_health

router = APIRouter(prefix="/api/settings", tags=["settings"])
DEFAULT_TEST_ROUTES_PAYLOAD = Body(default_factory=UpdateSettingsRequest)


@router.get(
    "",
    response_model=Envelope[SettingsRead],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def get_settings_route(
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: AdminUserDep,
) -> Envelope[SettingsRead]:
    del current_user
    result = SettingsService(session, settings).get_or_create_settings()
    return Envelope(success=True, data=result, error=None)


@router.put(
    "",
    response_model=Envelope[SettingsRead],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def update_settings_route(
    payload: UpdateSettingsRequest,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: AdminUserDep,
    background_tasks: BackgroundTasks,
) -> Envelope[SettingsRead]:
    service = SettingsService(session, settings)
    result = service.update_settings(current_user, payload)
    if result.rebuild_started and result.building_index_generation is not None:
        background_tasks.add_task(
            document_jobs.rebuild_building_index,
            settings,
            result.building_index_generation,
        )
    return Envelope(success=True, data=result, error=None)


@router.post(
    "/test-routes",
    response_model=Envelope[ProviderConnectionTestRead],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def test_routes(
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: AdminUserDep,
    payload: UpdateSettingsRequest = DEFAULT_TEST_ROUTES_PAYLOAD,
) -> Envelope[ProviderConnectionTestRead]:
    service = SettingsService(session, settings)
    draft = service.build_test_settings(current_user, payload)
    embedding_route = draft.pending_embedding_route or draft.embedding_route
    draft_runtime_settings = build_provider_runtime_settings(
        draft,
        embedding_route=embedding_route,
    )
    results = run_parallel_checks(
        {
            "response": lambda: build_response_adapter(draft.response_route).health_check(
                draft_runtime_settings
            ),
            "embedding": lambda: build_embedding_adapter(embedding_route).health_check(
                draft_runtime_settings
            ),
            "vision": lambda: build_vision_adapter(draft.vision_route).health_check(
                draft_runtime_settings
            ),
        }
    )
    return Envelope(
        success=True,
        data=ProviderConnectionTestRead(
            response=to_capability_health(results["response"], draft.response_route),
            embedding=to_capability_health(results["embedding"], embedding_route),
            vision=to_capability_health(results["vision"], draft.vision_route),
        ),
        error=None,
    )
