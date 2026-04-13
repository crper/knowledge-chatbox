"""测试用的 Dummy 类，用于单元测试中的依赖注入。

提供常用的 Dummy 类，避免在多个测试文件中重复定义相同的模拟类。
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from knowledge_chatbox_api.models.enums import (
    EmbeddingProvider,
    ReasoningMode,
    ResponseProvider,
    VisionProvider,
)
from knowledge_chatbox_api.schemas.settings import (
    AnthropicProfile,
    EmbeddingRouteConfig,
    OllamaProfile,
    OpenAIProfile,
    ProviderProfiles,
    ProviderRuntimeSettings,
    ResponseRouteConfig,
    VisionRouteConfig,
)


class DummyRoute(BaseModel):
    """模拟路由配置。"""

    provider: str
    model: str


class DummyRuntimeSettings(ProviderRuntimeSettings):
    """模拟运行时设置。"""

    model_config = ConfigDict(frozen=False)

    provider_profiles: ProviderProfiles = Field(
        default_factory=lambda: ProviderProfiles(
            openai=OpenAIProfile(
                api_key="sk-openai",
                base_url="https://api.openai.com/v1",
            ),
            anthropic=AnthropicProfile(
                api_key="sk-ant",
                base_url="https://api.anthropic.com",
            ),
            ollama=OllamaProfile(base_url="http://localhost:11434"),
        ),
    )
    response_route: ResponseRouteConfig = Field(
        default_factory=lambda: ResponseRouteConfig(
            provider=ResponseProvider.OPENAI,
            model="gpt-5.4",
        ),
    )
    embedding_route: EmbeddingRouteConfig = Field(
        default_factory=lambda: EmbeddingRouteConfig(
            provider=EmbeddingProvider.OPENAI,
            model="text-embedding-3-small",
        ),
    )
    vision_route: VisionRouteConfig = Field(
        default_factory=lambda: VisionRouteConfig(
            provider=VisionProvider.OPENAI,
            model="gpt-4o",
        ),
    )
    reasoning_mode: ReasoningMode = ReasoningMode.DEFAULT
    provider_timeout_seconds: int = 60
    system_prompt: str | None = None


class DummyMessage(BaseModel):
    """模拟聊天消息。"""

    role: str
    content: str


class DummyChatRepository:
    """模拟聊天仓库。"""

    def __init__(
        self,
        recent_messages: list[DummyMessage] | None = None,
        *,
        space_id: int | None = None,
    ) -> None:
        self._recent_messages = list(recent_messages or [])
        self._space_id = space_id

    def list_recent_messages(self, session_id: int, *, limit: int):
        assert session_id == 1
        assert limit == 4
        return list(self._recent_messages)

    def get_session(self, session_id: int):
        assert session_id == 1
        return SimpleNamespace(space_id=self._space_id)


class DummyPromptAttachmentService:
    """模拟提示附件服务。"""

    def build_prompt_attachments(
        self, attachments: list[Any], active_space_id: int | None
    ) -> list[Any]:
        del attachments, active_space_id
        return []

    def resolve_prompt_text(self, question: str, attachments: list[Any]) -> str:
        del attachments
        return question
