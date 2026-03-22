"""文档Jobs任务模块。"""

from __future__ import annotations

from datetime import UTC, datetime

from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.services.chat.chat_run_service import STREAM_INTERRUPTED_ERROR_MESSAGE
from knowledge_chatbox_api.services.documents.rebuild_service import RebuildService
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)


def compensate_processing_documents(session) -> int:
    """把异常中断的 processing 文档回退为 failed。"""
    repository = DocumentRepository(session)
    documents = repository.list_processing_documents()
    for document in documents:
        document.lifecycle_status = "failed"
        document.error_message = "Processing interrupted during previous run."
    session.commit()
    return len(documents)


def compensate_active_chat_runs(session) -> int:
    """把异常中断的活跃聊天运行回退为 failed。"""
    run_repository = ChatRunRepository(session)
    chat_repository = ChatRepository(session)
    runs = run_repository.list_stale_active_runs()
    if not runs:
        return 0

    now = datetime.now(UTC)
    for run in runs:
        run.status = "failed"
        run.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
        run.finished_at = now
        if run.assistant_message_id is None:
            continue
        assistant_message = chat_repository.get_message(run.assistant_message_id)
        if assistant_message is None:
            continue
        assistant_message.status = "failed"
        assistant_message.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
    session.commit()
    return len(runs)


def compensate_index_rebuild_status(session, settings) -> bool:
    """启动时将 running 的重建状态补偿为 failed。"""
    service = SettingsService(session, settings)
    settings_record = service.get_or_create_settings_record()
    if settings_record.index_rebuild_status != INDEX_REBUILD_STATUS_RUNNING:
        return False
    settings_record.index_rebuild_status = "failed"
    session.commit()
    return True


def rebuild_building_index(settings, target_generation: int | None) -> int:
    """后台重建 building generation 索引。"""
    if target_generation is None:
        return 0
    session_factory = create_session_factory()
    with session_factory() as session:
        service = RebuildService(session, settings)
        return service.rebuild_building_generation(target_generation)
