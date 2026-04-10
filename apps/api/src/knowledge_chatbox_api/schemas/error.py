"""Error-specific response schemas used for OpenAPI documentation."""

from typing import Literal

from pydantic import BaseModel

from knowledge_chatbox_api.schemas.common import ErrorInfo


class ErrorEnvelope(BaseModel):
    """OpenAPI model for failed API responses."""

    success: Literal[False] = False
    data: None = None
    error: ErrorInfo
