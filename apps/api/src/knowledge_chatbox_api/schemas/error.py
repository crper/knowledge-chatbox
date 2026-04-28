"""Error-specific response schemas used for OpenAPI documentation."""

from typing import Literal

from knowledge_chatbox_api.schemas import ReadOnlySchema
from knowledge_chatbox_api.schemas.common import ErrorInfo


class ErrorEnvelope(ReadOnlySchema):
    """OpenAPI model for failed API responses."""

    success: Literal[False] = False
    data: None = None
    error: ErrorInfo
