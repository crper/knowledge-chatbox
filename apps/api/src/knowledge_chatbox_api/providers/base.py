"""Provider capability interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict

from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ResponseRouteConfig,
    VisionRouteConfig,
)


class ProviderHealthResult(BaseModel):
    """描述 capability 健康检查结果。"""

    healthy: bool
    message: str
    code: str | None = None
    latency_ms: int | None = None


class ResponseStreamChunk(BaseModel):
    """统一响应流分片。"""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: str
    delta: str | None = None
    error_message: str | None = None
    provider_response_id: str | None = None
    usage: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None


class ProviderSettings(Protocol):
    """Provider 所需的基础设置协议。"""

    provider_profiles: ProviderProfiles
    provider_timeout_seconds: int


class ResponseSettings(ProviderSettings, Protocol):
    """Response capability 需要的设置。"""

    response_route: ResponseRouteConfig


class ResponseRuntimeSettings(ResponseSettings, Protocol):
    """生成响应时需要的完整设置。"""

    reasoning_mode: str


class EmbeddingSettings(ProviderSettings, Protocol):
    """Embedding capability 需要的设置。"""

    embedding_route: EmbeddingRouteConfig


class VisionSettings(ProviderSettings, Protocol):
    """Vision capability 需要的设置。"""

    vision_route: VisionRouteConfig


class BaseResponseAdapter(ABC):
    """统一 response capability 接口。"""

    @abstractmethod
    def response(self, messages: list[dict[str, Any]], settings: ResponseRuntimeSettings) -> str:
        raise NotImplementedError

    @abstractmethod
    def stream_response(
        self,
        messages: list[dict[str, Any]],
        settings: ResponseRuntimeSettings,
    ):
        raise NotImplementedError

    @abstractmethod
    def health_check(self, settings: ResponseSettings) -> ProviderHealthResult:
        raise NotImplementedError


class BaseEmbeddingAdapter(ABC):
    """统一 embedding capability 接口。"""

    @abstractmethod
    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        raise NotImplementedError


class BaseVisionAdapter(ABC):
    """统一 vision capability 接口。"""

    @abstractmethod
    def analyze_image(self, inputs: list[dict[str, Any]], settings: VisionSettings) -> str:
        raise NotImplementedError

    @abstractmethod
    def health_check(self, settings: VisionSettings) -> ProviderHealthResult:
        raise NotImplementedError
