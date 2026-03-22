"""聊天运行事件仓储。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.chat import ChatRunEvent


class ChatRunEventRepository:
    """封装聊天运行事件的数据访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def append_event(
        self,
        *,
        run_id: int,
        seq: int,
        event_type: str,
        payload_json: dict,
    ) -> ChatRunEvent:
        event = ChatRunEvent(
            run_id=run_id,
            seq=seq,
            event_type=event_type,
            payload_json=payload_json,
        )
        self.session.add(event)
        self.session.flush()
        return event

    def list_for_run(self, run_id: int) -> list[ChatRunEvent]:
        statement = (
            select(ChatRunEvent)
            .where(ChatRunEvent.run_id == run_id)
            .order_by(ChatRunEvent.seq.asc(), ChatRunEvent.id.asc())
        )
        return list(self.session.scalars(statement).all())
