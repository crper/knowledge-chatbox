from typing import Any

from sqlalchemy import select

from knowledge_chatbox_api.models.chat import ChatRunEvent
from knowledge_chatbox_api.repositories.base import BaseRepository


class ChatRunEventRepository(BaseRepository[ChatRunEvent]):
    model_type = ChatRunEvent

    def append_event(
        self,
        *,
        run_id: int,
        seq: int,
        event_type: str,
        payload_json: dict[str, Any],
        flush: bool = True,
    ) -> ChatRunEvent:
        event = ChatRunEvent(
            run_id=run_id,
            seq=seq,
            event_type=event_type,
            payload_json=payload_json,
        )
        self.session.add(event)
        if flush:
            self.session.flush()
        return event

    def list_for_run(self, run_id: int) -> list[ChatRunEvent]:
        statement = (
            select(ChatRunEvent)
            .where(ChatRunEvent.run_id == run_id)
            .order_by(ChatRunEvent.seq.asc(), ChatRunEvent.id.asc())
        )
        return list(self.session.scalars(statement).all())
