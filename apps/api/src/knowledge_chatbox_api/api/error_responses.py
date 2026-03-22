"""Reusable OpenAPI response declarations for common API errors."""

from __future__ import annotations

from typing import Any

from fastapi import status

from knowledge_chatbox_api.schemas.error import ErrorEnvelope

type OpenApiResponse = dict[str, Any]
type OpenApiResponses = dict[int | str, OpenApiResponse]


def _error_response(description: str) -> OpenApiResponse:
    return {
        "model": ErrorEnvelope,
        "description": description,
    }


UNAUTHORIZED_RESPONSE = _error_response("Authentication required.")
FORBIDDEN_RESPONSE = _error_response("Admin permission required.")
NOT_FOUND_RESPONSE = _error_response("Requested resource was not found.")
CONFLICT_RESPONSE = _error_response("Request conflicts with the current resource state.")
RATE_LIMITED_RESPONSE = _error_response("Too many requests.")
INTERNAL_ERROR_RESPONSE = _error_response("Internal server error.")

ADMIN_ROUTE_ERROR_RESPONSES: OpenApiResponses = {
    status.HTTP_401_UNAUTHORIZED: UNAUTHORIZED_RESPONSE,
    status.HTTP_403_FORBIDDEN: FORBIDDEN_RESPONSE,
    status.HTTP_500_INTERNAL_SERVER_ERROR: INTERNAL_ERROR_RESPONSE,
}

USER_CREATE_ERROR_RESPONSES: OpenApiResponses = {
    **ADMIN_ROUTE_ERROR_RESPONSES,
    status.HTTP_409_CONFLICT: CONFLICT_RESPONSE,
}

DOCUMENT_REINDEX_ERROR_RESPONSES: OpenApiResponses = {
    status.HTTP_401_UNAUTHORIZED: UNAUTHORIZED_RESPONSE,
    status.HTTP_404_NOT_FOUND: NOT_FOUND_RESPONSE,
    status.HTTP_409_CONFLICT: CONFLICT_RESPONSE,
    status.HTTP_500_INTERNAL_SERVER_ERROR: INTERNAL_ERROR_RESPONSE,
}

CHAT_STREAM_RESPONSES: OpenApiResponses = {
    status.HTTP_200_OK: {
        "description": "Server-Sent Events stream.",
        "content": {
            "text/event-stream": {
                "schema": {
                    "type": "string",
                }
            }
        },
    },
    status.HTTP_401_UNAUTHORIZED: UNAUTHORIZED_RESPONSE,
    status.HTTP_404_NOT_FOUND: NOT_FOUND_RESPONSE,
    status.HTTP_409_CONFLICT: CONFLICT_RESPONSE,
    status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMITED_RESPONSE,
    status.HTTP_500_INTERNAL_SERVER_ERROR: INTERNAL_ERROR_RESPONSE,
}
