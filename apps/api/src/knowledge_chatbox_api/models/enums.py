"""Domain enums used across models, schemas, services and repositories.

Each enum inherits from ``str`` so that:

* ``UserRole.ADMIN == "admin"`` is ``True`` — drop-in replacement for literals.
* Pydantic serialises the plain string value (``"admin"``), keeping the
  OpenAPI schema identical to the previous ``Literal``-based version.
* SQLAlchemy stores the string value when the column type is ``String(N)``.
"""

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    USER = "user"


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ThemePreference(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class ChatSessionStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class ReasoningMode(StrEnum):
    DEFAULT = "default"
    OFF = "off"
    ON = "on"


class ChatRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ChatMessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessageStatus(StrEnum):
    PENDING = "pending"
    STREAMING = "streaming"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ChatAttachmentType(StrEnum):
    IMAGE = "image"
    DOCUMENT = "document"


class DocumentStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class IngestStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class SpaceKind(StrEnum):
    PERSONAL = "personal"


class SettingsScopeType(StrEnum):
    GLOBAL = "global"
    WORKSPACE = "workspace"


class IndexRebuildStatus(StrEnum):
    IDLE = "idle"
    RUNNING = "running"
    FAILED = "failed"


class ProviderName(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    VOYAGE = "voyage"
    OLLAMA = "ollama"


class ResponseProvider(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


class EmbeddingProvider(StrEnum):
    OPENAI = "openai"
    VOYAGE = "voyage"
    OLLAMA = "ollama"


class VisionProvider(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


class OperationKind(StrEnum):
    CHAT_STREAM = "chat_stream"
    CHAT_SYNC = "chat_sync"
    DOCUMENT_UPLOAD = "document_upload"
    DOCUMENT_BACKGROUND_INGESTION = "document_background_ingestion"
    INDEX_REBUILD = "index_rebuild"
    COMPENSATION = "compensation"
