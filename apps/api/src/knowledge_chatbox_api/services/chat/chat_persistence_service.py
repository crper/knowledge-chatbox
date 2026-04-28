"""聊天投影持久化服务。"""

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.enums import ChatMessageStatus, ChatRunStatus
from knowledge_chatbox_api.schemas.chat import UsageData
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource
from knowledge_chatbox_api.utils.timing import utc_now

TEXT_DELTA_FLUSH_INTERVAL = 32
logger = get_logger(__name__)


class ChatPersistenceService:
    """封装聊天消息投影持久化逻辑。"""

    def __init__(
        self, session, *, text_delta_flush_interval: int = TEXT_DELTA_FLUSH_INTERVAL
    ) -> None:
        self.session = session
        self._pending_text_deltas = 0
        self._pending_text_fragments: list[str] = []
        self._pending_text_message = None
        self._text_delta_flush_interval = max(int(text_delta_flush_interval), 1)

    def flush_text_buffer(self) -> None:
        if self._pending_text_deltas == 0:
            return
        if self._pending_text_message is not None and self._pending_text_fragments:
            self._pending_text_message.content += "".join(self._pending_text_fragments)
        self.session.commit()
        self._pending_text_deltas = 0
        self._pending_text_fragments = []
        self._pending_text_message = None

    def _safe_flush_text_buffer(self) -> None:
        try:
            self.flush_text_buffer()
        except Exception:
            logger.warning(
                "flush_text_buffer_failed",
                pending_deltas=self._pending_text_deltas,
                exc_info=True,
            )
            self._pending_text_deltas = 0
            self._pending_text_fragments = []
            self._pending_text_message = None

    def mark_run_running(self, run, assistant_message) -> None:
        self.flush_text_buffer()
        now = utc_now()
        run.status = ChatRunStatus.RUNNING
        run.started_at = now
        assistant_message.status = ChatMessageStatus.STREAMING
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0

    def append_text_delta(self, assistant_message, delta: str) -> None:
        if self._pending_text_message is not assistant_message:
            self.flush_text_buffer()
            self._pending_text_message = assistant_message
        self._pending_text_fragments.append(delta)
        self._pending_text_deltas += 1
        if self._pending_text_deltas >= self._text_delta_flush_interval:
            self.flush_text_buffer()

    def complete_run(
        self,
        run,
        assistant_message,
        sources: list[WorkflowSource],
        usage: UsageData | None,
    ) -> None:
        self._safe_flush_text_buffer()
        now = utc_now()
        run.status = ChatRunStatus.SUCCEEDED
        run.finished_at = now
        run.usage_json = usage.model_dump(exclude_none=True) if usage else None
        assistant_message.status = ChatMessageStatus.SUCCEEDED
        assistant_message.error_message = None
        assistant_message.sources_json = [s.model_dump() for s in sources]
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0

    def _terminate_run(
        self,
        run,
        assistant_message,
        error_message: str,
        run_status: ChatRunStatus,
        *,
        sources: list[WorkflowSource] | None = None,
    ) -> None:
        self._safe_flush_text_buffer()
        now = utc_now()
        run.status = run_status
        run.error_message = error_message
        run.finished_at = now
        assistant_message.status = ChatMessageStatus.FAILED
        assistant_message.error_message = error_message
        sources_dump = [s.model_dump() for s in sources] if sources else []
        assistant_message.sources_json = sources_dump
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0

    def fail_run(
        self,
        run,
        assistant_message,
        error_message: str,
        *,
        sources: list[WorkflowSource] | None = None,
    ) -> None:
        self._terminate_run(
            run,
            assistant_message,
            error_message,
            ChatRunStatus.FAILED,
            sources=sources,
        )

    def cancel_run(
        self,
        run,
        assistant_message,
        error_message: str,
        *,
        sources: list[WorkflowSource] | None = None,
    ) -> None:
        self._terminate_run(
            run,
            assistant_message,
            error_message,
            ChatRunStatus.CANCELLED,
            sources=sources,
        )
