from __future__ import annotations

from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository


def create_user_and_session(migrated_db_session):
    user = User(
        username="alice",
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    repository = ChatRepository(migrated_db_session)
    chat_session = repository.create_session(user.id, "Session")
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_session)
    return chat_session, repository


def test_chat_repository_lists_attachments_in_one_batch_by_message_ids(
    migrated_db_session,
) -> None:
    chat_session, repository = create_user_and_session(migrated_db_session)
    first_message = repository.create_message(
        session_id=chat_session.id,
        role="user",
        content="first",
        status="succeeded",
        client_request_id="req-batch-1",
        attachments=[
            {
                "attachment_id": "att-1",
                "type": "image",
                "name": "first.png",
                "mime_type": "image/png",
                "size_bytes": 10,
            }
        ],
    )
    second_message = repository.create_message(
        session_id=chat_session.id,
        role="user",
        content="second",
        status="succeeded",
        client_request_id="req-batch-2",
        attachments=[
            {
                "attachment_id": "att-2",
                "type": "document",
                "name": "guide.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 20,
            }
        ],
    )
    migrated_db_session.commit()

    attachments_by_message_id = repository.list_attachments_for_message_ids(
        [first_message.id, second_message.id]
    )

    assert list(attachments_by_message_id) == [first_message.id, second_message.id]
    assert [item.attachment_id for item in attachments_by_message_id[first_message.id]] == ["att-1"]
    assert [item.attachment_id for item in attachments_by_message_id[second_message.id]] == [
        "att-2"
    ]
