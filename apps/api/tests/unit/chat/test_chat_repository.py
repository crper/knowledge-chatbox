from __future__ import annotations

from tests.fixtures.factories import UserFactory

from knowledge_chatbox_api.repositories.chat_repository import ChatRepository


def create_user_and_session(migrated_db_session):
    user = UserFactory.persisted_create(migrated_db_session, username="alice")
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


def test_chat_repository_lists_recent_messages_in_chronological_order(
    migrated_db_session,
) -> None:
    chat_session, repository = create_user_and_session(migrated_db_session)
    for index in range(1, 7):
        repository.create_message(
            session_id=chat_session.id,
            role="user" if index % 2 else "assistant",
            content=f"message-{index}",
            status="succeeded",
            client_request_id=f"req-recent-{index}" if index % 2 else None,
        )
    migrated_db_session.commit()

    recent_messages = (
        repository.list_recent_messages(chat_session.id, limit=4)
        if hasattr(repository, "list_recent_messages")
        else []
    )

    assert [message.content for message in recent_messages] == [
        "message-3",
        "message-4",
        "message-5",
        "message-6",
    ]
