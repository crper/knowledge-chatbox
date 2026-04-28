from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource


class ChatWorkflowDeps(BaseModel):
    """聊天工作流依赖注入。

    字段使用 Any 类型是因为 Pydantic 运行时不支持 Protocol 的 isinstance 检查。
    实际接口约束由文档字符串描述，测试时可直接注入 mock 对象。

    期望的接口契约：
    - chat_repository: 需提供 get_session(session_id) 和 list_recent_messages(session_id, *, limit)
    - retrieval_service: 需提供 retrieve_context(query, *, active_space_id, attachments)
    - prompt_attachment_service: 需提供 build_prompt_attachments(attachments, active_space_id)
      和 resolve_prompt_text(question, attachments)
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    session_id: int
    chat_repository: Any
    retrieval_service: Any
    prompt_attachment_service: Any
    runtime_settings: ProviderRuntimeSettings
    request_metadata: dict[str, Any] = Field(default_factory=dict)
    retrieved_sources: list[WorkflowSource] = Field(default_factory=list)
