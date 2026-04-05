from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
@pytest.mark.requires_db
def test_create_message_api_returns_chat_message_pair(
    api_client: TestClient, mock_chat_adapters
) -> None:
    """测试创建消息 API 返回正确的消息对"""
    from tests.fixtures.helpers import create_chat_session, login_as_admin

    login_as_admin(api_client)
    session_id = create_chat_session(api_client)

    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "请直接回答",
            "client_request_id": "req-chat-sync-1",
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["user_message"]["content"] == "请直接回答"
    assert payload["data"]["assistant_message"]["content"] == "同步回答"
    assert payload["data"]["user_message"]["attachments_json"] is None
    assert payload["data"]["assistant_message"]["attachments_json"] is None


@pytest.mark.integration
@pytest.mark.requires_db
def test_list_messages_api_keeps_full_history_behavior_without_pagination_params(
    api_client: TestClient,
    mock_chat_adapters,
) -> None:
    """测试列表消息 API 在没有分页参数时保持完整历史行为"""
    from tests.fixtures.helpers import create_chat_session, login_as_admin

    login_as_admin(api_client)
    session_id = create_chat_session(api_client, title="历史会话")

    create_response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "第一条消息",
            "client_request_id": "req-chat-sync-history-1",
        },
    )

    payload = create_response.json()["data"]
    user_message_id = payload["user_message"]["id"]
    assistant_message_id = payload["assistant_message"]["id"]

    response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    messages = response.json()["data"]

    assert response.status_code == 200
    assert [message["id"] for message in messages] == [user_message_id, assistant_message_id]
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[0]["attachments_json"] is None


@pytest.mark.integration
@pytest.mark.requires_db
def test_list_messages_api_supports_limit_for_latest_window(
    api_client: TestClient,
    mock_chat_adapters,
) -> None:
    """测试列表消息 API 支持 limit 参数获取最新窗口"""
    from tests.fixtures.helpers import create_chat_session, create_sync_message, login_as_admin

    login_as_admin(api_client)
    session_id = create_chat_session(api_client, title="分页会话")

    created_pairs = [
        create_sync_message(
            api_client,
            session_id,
            client_request_id=f"req-chat-page-{index}",
            content=f"消息 {index}",
        )
        for index in range(1, 4)
    ]

    response = api_client.get(f"/api/chat/sessions/{session_id}/messages?limit=2")
    messages = response.json()["data"]

    assert response.status_code == 200
    assert [message["id"] for message in messages] == [
        created_pairs[2]["user_message"]["id"],
        created_pairs[2]["assistant_message"]["id"],
    ]


@pytest.mark.integration
@pytest.mark.requires_db
def test_list_messages_api_supports_before_id_for_previous_window(
    api_client: TestClient,
    mock_chat_adapters,
) -> None:
    """测试列表消息 API 支持 before_id 参数获取上一页"""
    from tests.fixtures.helpers import create_chat_session, create_sync_message, login_as_admin

    login_as_admin(api_client)
    session_id = create_chat_session(api_client, title="分页会话")

    created_pairs = [
        create_sync_message(
            api_client,
            session_id,
            client_request_id=f"req-chat-before-{index}",
            content=f"消息 {index}",
        )
        for index in range(1, 4)
    ]
    latest_user_message_id = created_pairs[2]["user_message"]["id"]

    response = api_client.get(
        f"/api/chat/sessions/{session_id}/messages?before_id={latest_user_message_id}&limit=2"
    )
    messages = response.json()["data"]

    assert response.status_code == 200
    assert [message["id"] for message in messages] == [
        created_pairs[1]["user_message"]["id"],
        created_pairs[1]["assistant_message"]["id"],
    ]
