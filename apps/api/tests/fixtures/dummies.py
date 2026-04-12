"""测试用的 Dummy 类，用于单元测试中的依赖注入。

提供常用的 Dummy 类，避免在多个测试文件中重复定义相同的模拟类。
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any


class DummyRoute:
    """模拟路由配置。"""

    def __init__(self, provider: str, model: str) -> None:
        self.provider = provider
        self.model = model


class DummyProfiles:
    """模拟 Provider 配置。"""

    class OpenAI:
        api_key = "sk-openai"
        base_url = "https://api.openai.com/v1"

    class Anthropic:
        api_key = "sk-ant"
        base_url = "https://api.anthropic.com"

    class Ollama:
        base_url = "http://localhost:11434"

    openai = OpenAI()
    anthropic = Anthropic()
    ollama = Ollama()


class DummyRuntimeSettings:
    """模拟运行时设置。"""

    provider_profiles = DummyProfiles()
    response_route = DummyRoute("openai", "gpt-5.4")
    reasoning_mode = "default"
    provider_timeout_seconds = 60
    system_prompt = None


class DummyMessage:
    """模拟聊天消息。"""

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content


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
