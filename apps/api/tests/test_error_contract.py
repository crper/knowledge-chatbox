from __future__ import annotations

from knowledge_chatbox_api.main import create_app


def test_openapi_declares_admin_route_errors() -> None:
    schema = create_app().openapi()

    user_create_responses = schema["paths"]["/api/users"]["post"]["responses"]
    settings_read_responses = schema["paths"]["/api/settings"]["get"]["responses"]

    assert {"201", "401", "403", "409", "500"} <= set(user_create_responses)
    assert {"200", "401", "403", "500"} <= set(settings_read_responses)


def test_openapi_declares_document_reindex_errors() -> None:
    schema = create_app().openapi()
    responses = schema["paths"]["/api/documents/{document_id}/reindex"]["post"]["responses"]

    assert {"200", "401", "404", "409", "500"} <= set(responses)


def test_openapi_documents_chat_stream_as_sse_with_errors() -> None:
    schema = create_app().openapi()
    responses = schema["paths"]["/api/chat/sessions/{session_id}/messages/stream"]["post"][
        "responses"
    ]

    assert {"200", "401", "404", "409", "429", "500"} <= set(responses)
    assert "text/event-stream" in responses["200"]["content"]
