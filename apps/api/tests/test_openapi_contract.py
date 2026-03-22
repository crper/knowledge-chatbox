from __future__ import annotations

from knowledge_chatbox_api.main import create_app


def test_openapi_exposes_product_metadata() -> None:
    schema = create_app().openapi()
    info = schema["info"]

    assert info["title"] == "Knowledge Chatbox API"
    assert info["version"] == "0.1.0"
    assert "本地优先" in info["description"]

    tags = {tag["name"]: tag for tag in schema["tags"]}
    assert {"auth", "chat", "documents", "health", "settings", "users"} <= set(tags)
    assert "登录" in tags["auth"]["description"]
    assert "流式" in tags["chat"]["description"]
