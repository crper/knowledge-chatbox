from threading import Barrier

from fastapi.testclient import TestClient


def test_health_returns_envelope(client: TestClient):
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["error"] is None
    assert payload["data"]["status"] == "ok"


def test_health_capabilities_reports_unconfigured_routes(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    response = api_client.get("/api/health/capabilities")
    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["response"]["provider"] == "ollama"
    assert payload["data"]["embedding"]["provider"] == "ollama"
    assert payload["data"]["vision"]["provider"] == "ollama"


def test_capability_health_does_not_change_rebuild_status(
    api_client: TestClient,
) -> None:
    from knowledge_chatbox_api.core.config import get_settings
    from knowledge_chatbox_api.db.session import create_session_factory
    from knowledge_chatbox_api.services.settings.settings_service import (
        INDEX_REBUILD_STATUS_RUNNING,
        SettingsService,
    )

    settings = get_settings()
    session_factory = create_session_factory()
    with session_factory() as session:
        service = SettingsService(session, settings)
        settings_record = service.get_or_create_settings_record()
        settings_record.index_rebuild_status = INDEX_REBUILD_STATUS_RUNNING
        settings_record.building_index_generation = settings_record.active_index_generation + 1
        session.commit()

    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    response = api_client.get("/api/health/capabilities")

    assert response.status_code == 200

    with session_factory() as session:
        reloaded = SettingsService(session, settings).get_or_create_settings_record()
        assert reloaded.index_rebuild_status == INDEX_REBUILD_STATUS_RUNNING


def test_health_capabilities_runs_capability_checks_in_parallel(
    api_client: TestClient,
    monkeypatch,
) -> None:
    from knowledge_chatbox_api.api.routes import health as health_route_module
    from knowledge_chatbox_api.providers.base import ProviderHealthResult

    api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    barrier = Barrier(3, timeout=1)

    class FakeAdapter:
        def __init__(self, name: str) -> None:
            self.name = name

        def health_check(self, _settings):
            barrier.wait()
            return ProviderHealthResult(healthy=True, message=f"{self.name}:ok", latency_ms=1)

    monkeypatch.setattr(
        health_route_module,
        "build_response_adapter_from_settings",
        lambda _settings: FakeAdapter("response"),
    )
    monkeypatch.setattr(
        health_route_module,
        "build_embedding_adapter_from_settings",
        lambda _settings: FakeAdapter("embedding"),
    )
    monkeypatch.setattr(
        health_route_module,
        "build_vision_adapter_from_settings",
        lambda _settings: FakeAdapter("vision"),
    )

    response = api_client.get("/api/health/capabilities")

    assert response.status_code == 200
