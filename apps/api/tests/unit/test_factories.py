from tests.fixtures.factories import ChatMessageFactory, DocumentRevisionFactory


def test_chat_message_factory_enforces_client_request_id_by_role() -> None:
    user = ChatMessageFactory.build(role="user")
    assistant = ChatMessageFactory.build(role="assistant", client_request_id="req-assistant")
    system = ChatMessageFactory.build(role="system", client_request_id="req-system")

    assert isinstance(user.client_request_id, str)
    assert user.client_request_id != ""
    assert assistant.client_request_id is None
    assert system.client_request_id is None


def test_document_revision_factory_derives_mime_type_from_file_type() -> None:
    revision = DocumentRevisionFactory.build(file_type="pdf")

    assert revision.mime_type == "application/pdf"
