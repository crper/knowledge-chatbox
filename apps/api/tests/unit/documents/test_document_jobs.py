from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

from knowledge_chatbox_api.models.enums import IndexRebuildStatus, IngestStatus
from knowledge_chatbox_api.tasks import document_jobs


def test_complete_document_ingestion_uses_ingestion_service_builder(monkeypatch) -> None:
    fake_session = object()
    fake_settings = object()
    builder_calls: list[tuple[object, object]] = []

    @contextmanager
    def fake_session_scope():
        yield fake_session

    monkeypatch.setattr(document_jobs, "create_session_factory", lambda: fake_session_scope)

    def fake_ingestion_service(session, settings):
        builder_calls.append((session, settings))
        return SimpleNamespace(
            complete_document_ingestion=lambda revision_id: SimpleNamespace(
                id=revision_id,
                lifecycle_status=IngestStatus.INDEXED,
            )
        )

    monkeypatch.setattr(document_jobs, "IngestionService", fake_ingestion_service)

    completed = document_jobs.complete_document_ingestion(fake_settings, revision_id=7)

    assert completed is True
    assert builder_calls == [(fake_session, fake_settings)]


def test_compensate_index_rebuild_status_uses_settings_service_builder(monkeypatch) -> None:
    fake_settings = object()
    builder_calls: list[tuple[object, object]] = []
    settings_record = SimpleNamespace(index_rebuild_status=IndexRebuildStatus.RUNNING)
    commit_calls: list[str] = []

    def fake_settings_service(session, settings):
        builder_calls.append((session, settings))
        return SimpleNamespace(get_or_create_settings_record=lambda: settings_record)

    monkeypatch.setattr(document_jobs, "SettingsService", fake_settings_service)
    session = SimpleNamespace(commit=lambda: commit_calls.append("commit"))

    changed = document_jobs.compensate_index_rebuild_status(session, fake_settings)

    assert changed is True
    assert settings_record.index_rebuild_status == IndexRebuildStatus.FAILED
    assert builder_calls == [(session, fake_settings)]
    assert commit_calls == ["commit"]


def test_rebuild_building_index_uses_rebuild_service_builder(monkeypatch) -> None:
    fake_session = object()
    fake_settings = object()
    builder_calls: list[tuple[object, object]] = []

    @contextmanager
    def fake_session_scope():
        yield fake_session

    monkeypatch.setattr(document_jobs, "create_session_factory", lambda: fake_session_scope)

    def fake_rebuild_service(session, settings):
        builder_calls.append((session, settings))
        return SimpleNamespace(rebuild_building_generation=lambda generation: generation + 2)

    monkeypatch.setattr(document_jobs, "RebuildService", fake_rebuild_service)

    rebuilt = document_jobs.rebuild_building_index(fake_settings, target_generation=3)

    assert rebuilt == 5
    assert builder_calls == [(fake_session, fake_settings)]
