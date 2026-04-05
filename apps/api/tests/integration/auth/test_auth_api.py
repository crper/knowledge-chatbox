from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_login_sets_http_only_session_cookie_with_path(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    assert response.status_code == 200
    cookie_header = response.headers["set-cookie"]
    assert "knowledge_chatbox_session=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "Path=/" in cookie_header
    assert "SameSite=lax" in cookie_header
    assert "Secure" not in cookie_header


def test_login_sets_secure_cookie_for_https_requests(api_client_https: TestClient) -> None:
    response = api_client_https.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    assert response.status_code == 200
    cookie_header = response.headers["set-cookie"]
    assert "knowledge_chatbox_session=" in cookie_header
    assert "Secure" in cookie_header
    assert "Path=/" in cookie_header


def test_login_can_disable_secure_cookie_with_explicit_override(
    api_client_https_cookie_insecure: TestClient,
) -> None:
    response = api_client_https_cookie_insecure.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    assert response.status_code == 200
    cookie_header = response.headers["set-cookie"]
    assert "knowledge_chatbox_session=" in cookie_header
    assert "Secure" not in cookie_header
    assert "Path=/" in cookie_header


def test_logout_deletes_session_cookie_with_root_path(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    response = api_client.post("/api/auth/logout")

    assert response.status_code == 200
    cookie_header = response.headers["set-cookie"]
    assert "knowledge_chatbox_session=" in cookie_header
    assert "Path=/" in cookie_header


def test_login_and_me_return_current_user(api_client: TestClient) -> None:
    login_response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    login_payload = login_response.json()
    access_token = login_payload["data"]["access_token"]

    assert login_response.status_code == 200
    assert "knowledge_chatbox_session" in login_response.cookies
    assert isinstance(access_token, str)
    assert access_token

    me_response = api_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    payload = me_response.json()

    assert me_response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["username"] == "admin"


def test_refresh_rotates_cookie_and_returns_new_access_token(api_client: TestClient) -> None:
    login_response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    original_cookie = login_response.cookies.get("knowledge_chatbox_session")
    refresh_response = api_client.post("/api/auth/refresh")
    refresh_payload = refresh_response.json()

    assert refresh_response.status_code == 200
    assert refresh_payload["success"] is True
    assert isinstance(refresh_payload["data"]["access_token"], str)
    assert refresh_payload["data"]["access_token"]
    assert refresh_response.cookies.get("knowledge_chatbox_session") != original_cookie


def test_bootstrap_returns_authenticated_false_without_session_cookie(
    api_client: TestClient,
) -> None:
    response = api_client.post("/api/auth/bootstrap")
    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["authenticated"] is False
    assert payload["data"]["access_token"] is None
    assert payload["data"]["user"] is None


def test_bootstrap_restores_session_without_rotating_cookie(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    bootstrap_response = api_client.post("/api/auth/bootstrap")
    payload = bootstrap_response.json()

    assert bootstrap_response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["authenticated"] is True
    assert payload["data"]["user"]["username"] == "admin"
    assert isinstance(payload["data"]["access_token"], str)
    assert "knowledge_chatbox_session" not in bootstrap_response.cookies


def test_login_preflight_request_is_allowed(api_client: TestClient) -> None:
    response = api_client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_change_password_invalidates_old_session(api_client: TestClient) -> None:
    login_response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert login_response.status_code == 200
    old_access_token = login_response.json()["data"]["access_token"]

    change_password_response = api_client.post(
        "/api/auth/change-password",
        json={"current_password": "admin123456", "new_password": "new-admin-123"},
        headers={"Authorization": f"Bearer {old_access_token}"},
    )
    assert change_password_response.status_code == 200

    me_response = api_client.get("/api/auth/me")
    assert me_response.status_code == 401

    relogin_response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "new-admin-123"},
    )
    assert relogin_response.status_code == 200


def test_patch_preferences_updates_current_user_theme(api_client: TestClient) -> None:
    login_response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    access_token = login_response.json()["data"]["access_token"]

    response = api_client.patch(
        "/api/auth/preferences",
        json={"theme_preference": "dark"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    payload = response.json()

    assert response.status_code == 200
    assert payload["data"]["theme_preference"] == "dark"


@pytest.mark.parametrize(
    ("path", "payload", "field"),
    [
        ("/api/auth/login", {"username": "", "password": "admin123456"}, "username"),
        ("/api/auth/login", {"username": "admin", "password": "1234567"}, "password"),
        (
            "/api/auth/change-password",
            {"current_password": "admin123456", "new_password": "1234567"},
            "new_password",
        ),
        ("/api/auth/preferences", {"theme_preference": "blue"}, "theme_preference"),
    ],
)
def test_auth_request_schemas_reject_invalid_payloads(
    api_client: TestClient,
    path: str,
    payload: dict[str, str],
    field: str,
) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    if path == "/api/auth/preferences":
        response = api_client.patch(path, json=payload)
    else:
        response = api_client.post(path, json=payload)
    response_payload = response.json()
    error = response_payload["error"]

    assert response.status_code == 422
    assert response_payload["success"] is False
    assert error["code"] == "validation_error"
    assert isinstance(error["details"], list)
    assert any(field in ".".join(str(part) for part in item["loc"]) for item in error["details"])


def test_admin_can_create_user_and_non_admin_is_forbidden(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    create_response = api_client.post(
        "/api/users",
        json={"username": "alice", "password": "secret-123", "role": "user"},
    )
    assert create_response.status_code == 201

    api_client.post("/api/auth/logout")
    api_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret-123"},
    )

    forbidden_response = api_client.get("/api/users")
    payload = forbidden_response.json()

    assert forbidden_response.status_code == 403
    assert payload["success"] is False


def test_admin_can_delete_regular_user(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    create_response = api_client.post(
        "/api/users",
        json={"username": "alice", "password": "secret-123", "role": "user"},
    )
    user_id = create_response.json()["data"]["id"]

    delete_response = api_client.delete(f"/api/users/{user_id}")
    payload = delete_response.json()

    assert delete_response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["status"] == "deleted"


def test_admin_cannot_disable_or_delete_admin(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    create_response = api_client.post(
        "/api/users",
        json={"username": "ops", "password": "secret-123", "role": "admin"},
    )
    admin_id = create_response.json()["data"]["id"]

    disable_response = api_client.patch(f"/api/users/{admin_id}", json={"status": "disabled"})
    delete_response = api_client.delete(f"/api/users/{admin_id}")

    assert disable_response.status_code == 400
    assert delete_response.status_code == 400


def test_admin_update_missing_user_returns_not_found(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    response = api_client.patch("/api/users/999999", json={"status": "active"})
    payload = response.json()

    assert response.status_code == 404
    assert payload["error"] == {
        "code": "user_not_found",
        "message": "User not found.",
        "details": None,
    }
