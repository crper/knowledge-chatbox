"""聊天投影持久化服务。"""

from __future__ import annotations

from datetime import UTC, datetime

TEXT_DELTA_FLUSH_INTERVAL = 8


class ChatPersistenceService:
    """封装聊天消息投影持久化逻辑。"""

    def __init__(
        self, session, *, text_delta_flush_interval: int = TEXT_DELTA_FLUSH_INTERVAL
    ) -> None:
        self.session = session
        self._pending_text_deltas = 0
        self._text_delta_flush_interval = max(int(text_delta_flush_interval), 1)

    def flush_text_buffer(self) -> None:
        if self._pending_text_deltas == 0:
            return
        self.session.commit()
        self._pending_text_deltas = 0

    def mark_run_running(self, run, assistant_message) -> None:
        self.flush_text_buffer()
        now = datetime.now(UTC)
        run.status = "running"
        run.started_at = now
        assistant_message.status = "streaming"
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0

    def append_text_delta(self, assistant_message, delta: str) -> None:
        assistant_message.content = f"{assistant_message.content}{delta}"
        self._pending_text_deltas += 1
        if self._pending_text_deltas >= self._text_delta_flush_interval:
            self.flush_text_buffer()

    def complete_run(self, run, assistant_message, sources: list[dict], usage: dict | None) -> None:
        self.flush_text_buffer()
        now = datetime.now(UTC)
        run.status = "succeeded"
        run.finished_at = now
        run.usage_json = usage
        assistant_message.status = "succeeded"
        assistant_message.error_message = None
        assistant_message.sources_json = sources
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0

    def fail_run(self, run, assistant_message, error_message: str) -> None:
        self.flush_text_buffer()
        now = datetime.now(UTC)
        run.status = "failed"
        run.error_message = error_message
        run.finished_at = now
        assistant_message.status = "failed"
        assistant_message.error_message = error_message
        assistant_message.sources_json = []
        assistant_message.updated_at = now
        self.session.commit()
        self._pending_text_deltas = 0
