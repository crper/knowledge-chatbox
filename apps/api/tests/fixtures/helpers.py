from __future__ import annotations

from io import BytesIO
from typing import Any

from PIL import Image

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "Admin123456"


def login_with_credentials(
    api_client: Any,
    *,
    username: str,
    password: str,
) -> dict[str, Any]:
    """用给定账号登录并返回响应数据。"""
    response = api_client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["data"]


def login_as_admin(api_client: Any) -> dict[str, Any]:
    """登录管理员并返回响应数据"""
    return login_with_credentials(
        api_client,
        username=DEFAULT_ADMIN_USERNAME,
        password=DEFAULT_ADMIN_PASSWORD,
    )


def create_chat_session(api_client: Any, title: str = "测试会话") -> int:
    """创建聊天会话并返回 ID"""
    response = api_client.post("/api/chat/sessions", json={"title": title})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def create_logged_in_chat_session(
    api_client: Any,
    *,
    title: str = "测试会话",
    username: str = DEFAULT_ADMIN_USERNAME,
    password: str = DEFAULT_ADMIN_PASSWORD,
) -> int:
    """先登录，再创建聊天会话。"""
    login_with_credentials(
        api_client,
        username=username,
        password=password,
    )
    return create_chat_session(api_client, title=title)


def create_message(
    api_client: Any,
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


def upload_document_file(
    api_client: Any,
    *,
    filename: str,
    content: bytes,
    content_type: str,
    expected_status: int = 201,
) -> dict[str, Any]:
    """上传单个文件并返回响应数据。"""
    response = api_client.post(
        "/api/documents/upload",
        files={"file": (filename, content, content_type)},
    )
    assert response.status_code == expected_status
    return response.json()["data"]


def upload_text_document(
    api_client: Any,
    *,
    filename: str = "note.txt",
    content: bytes = b"hello world",
    content_type: str = "text/plain",
    expected_status: int = 201,
) -> dict[str, Any]:
    """上传默认文本文件。"""
    return upload_document_file(
        api_client,
        filename=filename,
        content=content,
        content_type=content_type,
        expected_status=expected_status,
    )


def build_png_bytes(
    *,
    size: tuple[int, int] = (4, 4),
    color: tuple[int, int, int] = (255, 0, 0),
) -> bytes:
    """构造测试用 PNG 二进制内容。"""
    buffer = BytesIO()
    Image.new("RGB", size, color=color).save(buffer, format="PNG")
    return buffer.getvalue()


def upload_image_document(
    api_client: Any,
    *,
    filename: str = "image.png",
    content: bytes | None = None,
    content_type: str = "image/png",
    expected_status: int = 202,
) -> dict[str, Any]:
    """上传默认图片文件。"""
    return upload_document_file(
        api_client,
        filename=filename,
        content=content or build_png_bytes(),
        content_type=content_type,
        expected_status=expected_status,
    )


def assert_error_response(response, expected_code: str, expected_status: int = 400):
    """断言错误响应格式"""
    assert response.status_code == expected_status
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"]["code"] == expected_code
    return payload["error"]
