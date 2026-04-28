"""健康检查路由定义。"""

from fastapi import APIRouter

from knowledge_chatbox_api.api.deps import AdminUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_response_adapter,
    build_vision_adapter,
)
from knowledge_chatbox_api.providers.health import run_parallel_checks
from knowledge_chatbox_api.schemas.common import Envelope, HealthData
from knowledge_chatbox_api.schemas.settings import (
    CapabilityHealthRead,
    ProviderConnectionTestRead,
)
from knowledge_chatbox_api.services.settings.settings_service import SettingsService

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=Envelope[HealthData])
def health() -> Envelope[HealthData]:
    return Envelope.ok(HealthData(status="ok"))


@router.get("/api/health/capabilities", response_model=Envelope[ProviderConnectionTestRead])
def capability_health(
    session: DbSessionDep,
    settings: SettingsDep,
    _current_user: AdminUserDep,
) -> Envelope[ProviderConnectionTestRead]:
    service = SettingsService(session, settings)
    runtime_settings = service.get_runtime_settings()
    results = run_parallel_checks(
        {
            "response": lambda: build_response_adapter(
                runtime_settings.response_route
            ).health_check(runtime_settings),
            "embedding": lambda: build_embedding_adapter(
                runtime_settings.embedding_route
            ).health_check(runtime_settings),
            "vision": lambda: build_vision_adapter(runtime_settings.vision_route).health_check(
                runtime_settings
            ),
        }
    )
    return Envelope.ok(
        ProviderConnectionTestRead(
            response=CapabilityHealthRead(
                provider=runtime_settings.response_route.provider,
                model=runtime_settings.response_route.model,
                healthy=results["response"].healthy,
                message=results["response"].message,
                latency_ms=results["response"].latency_ms,
            ),
            embedding=CapabilityHealthRead(
                provider=runtime_settings.embedding_route.provider,
                model=runtime_settings.embedding_route.model,
                healthy=results["embedding"].healthy,
                message=results["embedding"].message,
                latency_ms=results["embedding"].latency_ms,
            ),
            vision=CapabilityHealthRead(
                provider=runtime_settings.vision_route.provider,
                model=runtime_settings.vision_route.model,
                healthy=results["vision"].healthy,
                message=results["vision"].message,
                latency_ms=results["vision"].latency_ms,
            ),
        ),
    )
