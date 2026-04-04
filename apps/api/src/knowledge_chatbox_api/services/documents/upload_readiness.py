"""Document upload readiness checks."""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_chatbox_api.services.settings.settings_service import INDEX_REBUILD_STATUS_RUNNING


@dataclass(frozen=True)
class DocumentUploadReadiness:
    """Describe whether the current settings can accept new uploads."""

    can_upload: bool
    image_fallback: bool
    blocking_reason: str | None = None


def _has_text(value: str | None) -> bool:
    return bool((value or "").strip())


def _is_embedding_route_configured(settings_record, route) -> bool:
    if route is None or not _has_text(route.model):
        return False

    profiles = settings_record.provider_profiles
    if route.provider == "voyage":
        return _has_text(profiles.voyage.api_key)
    if route.provider == "ollama":
        return _has_text(profiles.ollama.base_url)
    return _has_text(profiles.openai.api_key)


def _is_vision_route_configured(settings_record) -> bool:
    route = settings_record.vision_route
    if not _has_text(route.model):
        return False

    profiles = settings_record.provider_profiles
    if route.provider == "anthropic":
        return _has_text(profiles.anthropic.api_key)
    if route.provider == "ollama":
        return _has_text(profiles.ollama.base_url)
    return _has_text(profiles.openai.api_key)


def get_document_upload_readiness(settings_record) -> DocumentUploadReadiness:
    """Evaluate whether uploads should be blocked or image parsing should degrade."""

    if not _is_embedding_route_configured(settings_record, settings_record.embedding_route):
        return DocumentUploadReadiness(
            can_upload=False,
            image_fallback=False,
            blocking_reason="embedding_not_configured",
        )

    if (
        settings_record.index_rebuild_status == INDEX_REBUILD_STATUS_RUNNING
        and settings_record.pending_embedding_route is not None
        and not _is_embedding_route_configured(
            settings_record,
            settings_record.pending_embedding_route,
        )
    ):
        return DocumentUploadReadiness(
            can_upload=False,
            image_fallback=False,
            blocking_reason="pending_embedding_not_configured",
        )

    return DocumentUploadReadiness(
        can_upload=True,
        image_fallback=not _is_vision_route_configured(settings_record),
        blocking_reason=None,
    )
