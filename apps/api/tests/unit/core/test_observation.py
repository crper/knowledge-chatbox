"""单元测试：统一观测字段定义。"""

import pytest

from knowledge_chatbox_api.core.observation import (
    OPERATION_KIND_CHAT_STREAM,
    OPERATION_KIND_CHAT_SYNC,
    OPERATION_KIND_COMPENSATION,
    OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION,
    OPERATION_KIND_DOCUMENT_UPLOAD,
    OPERATION_KIND_INDEX_REBUILD,
    ObservationFields,
)


class TestObservationFields:
    """Test ObservationFields dataclass."""

    def test_empty_to_dict_returns_empty_dict(self) -> None:
        fields = ObservationFields()
        assert fields.to_dict() == {}

    def test_partial_fields_filters_none_values(self) -> None:
        fields = ObservationFields(
            session_id=123,
            run_id=456,
        )
        result = fields.to_dict()
        assert result == {"session_id": 123, "run_id": 456}
        assert "request_id" not in result
        assert "operation_kind" not in result

    def test_all_fields_serialized(self) -> None:
        fields = ObservationFields(
            request_id="req-abc-123",
            operation_kind=OPERATION_KIND_CHAT_STREAM,
            session_id=1,
            run_id=2,
            document_revision_id=3,
            provider="ollama",
            model="qwen3.5:4b",
            generation=5,
        )
        result = fields.to_dict()
        assert result == {
            "request_id": "req-abc-123",
            "operation_kind": "chat_stream",
            "session_id": 1,
            "run_id": 2,
            "document_revision_id": 3,
            "provider": "ollama",
            "model": "qwen3.5:4b",
            "generation": 5,
        }

    def test_from_run_context(self) -> None:
        fields = ObservationFields.from_run_context(
            session_id=100,
            run_id=200,
            provider="anthropic",
            model="claude-3-5-sonnet",
            generation=3,
        )
        assert fields.session_id == 100
        assert fields.run_id == 200
        assert fields.provider == "anthropic"
        assert fields.model == "claude-3-5-sonnet"
        assert fields.generation == 3
        assert fields.request_id is None
        assert fields.operation_kind is None
        assert fields.document_revision_id is None

    def test_from_document_context(self) -> None:
        fields = ObservationFields.from_document_context(
            document_revision_id=500,
            provider="openai",
            model="text-embedding-3-small",
            generation=7,
        )
        assert fields.document_revision_id == 500
        assert fields.provider == "openai"
        assert fields.model == "text-embedding-3-small"
        assert fields.generation == 7
        assert fields.session_id is None
        assert fields.run_id is None
        assert fields.request_id is None
        assert fields.operation_kind is None

    def test_immutable(self) -> None:
        from pydantic import ValidationError

        fields = ObservationFields(session_id=1)
        with pytest.raises(ValidationError):
            fields.session_id = 2  # type: ignore[reportAttributeAccessIssue]

    def test_operation_kind_constants(self) -> None:
        assert OPERATION_KIND_CHAT_STREAM == "chat_stream"
        assert OPERATION_KIND_CHAT_SYNC == "chat_sync"
        assert OPERATION_KIND_DOCUMENT_UPLOAD == "document_upload"
        assert OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION == "document_background_ingestion"
        assert OPERATION_KIND_INDEX_REBUILD == "index_rebuild"
        assert OPERATION_KIND_COMPENSATION == "compensation"


class TestObservationFieldsLoggingIntegration:
    """Test that ObservationFields can be properly integrated with logging."""

    def test_bind_observation_fields_produces_correct_dict(self) -> None:
        fields = ObservationFields(
            request_id="req-xyz-789",
            operation_kind=OPERATION_KIND_DOCUMENT_UPLOAD,
            session_id=42,
            run_id=None,
            document_revision_id=99,
            provider="ollama",
            model="qwen3.5:4b",
            generation=1,
        )
        bound = fields.to_dict()
        assert "run_id" not in bound
        assert bound == {
            "request_id": "req-xyz-789",
            "operation_kind": "document_upload",
            "session_id": 42,
            "document_revision_id": 99,
            "provider": "ollama",
            "model": "qwen3.5:4b",
            "generation": 1,
        }
