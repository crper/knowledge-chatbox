from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def login_as_admin(api_client: TestClient) -> dict[str, Any]:
    """登录管理员并返回响应数据"""
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert response.status_code == 200
    return response.json()["data"]


def create_chat_session(api_client: TestClient, title: str = "测试会话") -> int:
    """创建聊天会话并返回 ID"""
    response = api_client.post("/api/chat/sessions", json={"title": title})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def create_message(
    api_client: TestClient,
    session_id: int,
    *,
    client_request_id: str,
    content: str,
) -> dict[str, Any]:
    """创建消息并返回数据"""
    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": content,
            "client_request_id": client_request_id,
        },
    )
    assert response.status_code == 200
    return response.json()["data"]


def create_sync_message(
    api_client: TestClient,
    session_id: int,
    *,
    client_request_id: str,
    content: str,
) -> dict[str, Any]:
    """创建同步消息并返回数据（create_message 的别名）"""
    return create_message(
        api_client,
        session_id,
        client_request_id=client_request_id,
        content=content,
    )


def assert_error_response(response, expected_code: str, expected_status: int = 400):
    """断言错误响应格式"""
    assert response.status_code == expected_status
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"]["code"] == expected_code
    return payload["error"]
