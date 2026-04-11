from sqlalchemy import delete, select

from knowledge_chatbox_api.models.chat import ChatRun, ChatSession
from knowledge_chatbox_api.models.enums import ChatRunStatus
from knowledge_chatbox_api.repositories.base import BaseRepository


class ChatRunRepository(BaseRepository[ChatRun]):
    model_type = ChatRun

    def create_run(
        self,
        *,
        session_id: int,
        status: str,
        response_provider: str,
        response_model: str,
        reasoning_mode: str,
        client_request_id: str,
        parent_run_id: int | None = None,
        user_message_id: int | None = None,
        assistant_message_id: int | None = None,
    ) -> ChatRun:
        chat_run = ChatRun(
            session_id=session_id,
            parent_run_id=parent_run_id,
            user_message_id=user_message_id,
            assistant_message_id=assistant_message_id,
            status=status,
            response_provider=response_provider,
            response_model=response_model,
            reasoning_mode=reasoning_mode,
            client_request_id=client_request_id,
        )
        return self.add(chat_run)

    def get_run(self, run_id: int) -> ChatRun | None:
        return self.get_one_or_none(id=run_id)

    def get_run_by_client_request_id(
        self,
        *,
        session_id: int,
        client_request_id: str,
    ) -> ChatRun | None:
        statement = (
            select(ChatRun)
            .where(
                ChatRun.session_id == session_id,
                ChatRun.client_request_id == client_request_id,
            )
            .order_by(ChatRun.id.desc())
        )
        return self.session.scalars(statement).first()

    def _active_runs_statement(self):
        return (
            select(ChatRun)
            .where(ChatRun.status.in_((ChatRunStatus.PENDING, ChatRunStatus.RUNNING)))
            .order_by(ChatRun.created_at.asc(), ChatRun.id.asc())
        )

    def list_active_runs(self, user_id: int) -> list[ChatRun]:
        statement = (
            self._active_runs_statement()
            .join(ChatSession, ChatSession.id == ChatRun.session_id)
            .where(ChatSession.user_id == user_id)
        )
        return list(self.session.scalars(statement).all())

    def list_stale_active_runs(self) -> list[ChatRun]:
        return list(self.session.scalars(self._active_runs_statement()).all())

    def delete_runs_for_messages(
        self, user_message_id: int, assistant_message_id: int | None = None
    ) -> None:
        statement = delete(ChatRun).where(ChatRun.user_message_id == user_message_id)
        if assistant_message_id is not None:
            statement = statement.where(ChatRun.assistant_message_id == assistant_message_id)
        self.session.execute(statement)

    def delete_runs_for_session(self, session_id: int) -> None:
        self.session.execute(delete(ChatRun).where(ChatRun.session_id == session_id))
