"""Document upload readiness checks."""

from dataclasses import dataclass

from knowledge_chatbox_api.models.enums import IndexRebuildStatus, ProviderName
from knowledge_chatbox_api.utils.helpers import strip_or_none


@dataclass(frozen=True)
class DocumentUploadReadiness:
    """Describe whether the current settings can accept new uploads."""

    can_upload: bool
    image_fallback: bool
    blocking_reason: str | None = None


_PROVIDER_CREDENTIAL_FIELD: dict[ProviderName, str] = {
    ProviderName.OPENAI: "api_key",
    ProviderName.ANTHROPIC: "api_key",
    ProviderName.VOYAGE: "api_key",
    ProviderName.OLLAMA: "base_url",
}


def _is_route_configured(settings_record, route) -> bool:
    if route is None or not bool(strip_or_none(route.model)):
        return False
    credential_field = _PROVIDER_CREDENTIAL_FIELD.get(route.provider)
    if credential_field is None:
        return False
    profile = getattr(settings_record.provider_profiles, route.provider, None)
    if profile is None:
        return False
    return bool(strip_or_none(getattr(profile, credential_field, None)))


def get_document_upload_readiness(settings_record) -> DocumentUploadReadiness:
    """Evaluate whether uploads should be blocked or image parsing should degrade."""

    if not _is_route_configured(settings_record, settings_record.embedding_route):
        return DocumentUploadReadiness(
            can_upload=False,
            image_fallback=False,
            blocking_reason="embedding_not_configured",
        )

    if (
        settings_record.index_rebuild_status == IndexRebuildStatus.RUNNING
        and settings_record.pending_embedding_route is not None
        and not _is_route_configured(
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
        image_fallback=not _is_route_configured(settings_record, settings_record.vision_route),
        blocking_reason=None,
    )
