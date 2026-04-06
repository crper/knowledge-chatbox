from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ChatWorkflowDeps:
    session: Any
    actor: Any
    chat_repository: Any
    chat_run_repository: Any
    chat_run_event_repository: Any
    retrieval_service: Any
    prompt_attachment_service: Any
    runtime_settings: Any
    request_metadata: dict[str, Any]
    workflow_state: dict[str, Any] = field(default_factory=dict)
