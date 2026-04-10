"""设置与 provider 相关的共享映射函数。"""

from knowledge_chatbox_api.providers.base import ProviderHealthResult
from knowledge_chatbox_api.schemas.settings import (
    CapabilityHealthRead,
    EmbeddingRouteConfig,
    ResponseRouteConfig,
    VisionRouteConfig,
)


def to_capability_health(
    result: ProviderHealthResult,
    route: ResponseRouteConfig | EmbeddingRouteConfig | VisionRouteConfig,
) -> CapabilityHealthRead:
    """把 provider 健康检查结果映射为 API 响应。"""
    return CapabilityHealthRead(
        provider=route.provider,
        model=route.model,
        healthy=result.healthy,
        message=result.message,
        latency_ms=result.latency_ms,
    )
