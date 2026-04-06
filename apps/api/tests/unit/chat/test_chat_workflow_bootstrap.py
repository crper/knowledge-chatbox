from __future__ import annotations

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult


def test_settings_exposes_no_chat_workflow_backend_toggle() -> None:
    settings = Settings()
    assert not hasattr(settings, "chat_workflow_backend")


def test_chat_workflow_types_are_importable() -> None:
    assert ChatWorkflowDeps is not None
    assert ChatWorkflowResult is not None
