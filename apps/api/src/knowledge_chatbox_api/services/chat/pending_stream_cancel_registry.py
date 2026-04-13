from __future__ import annotations

from cachetools import TTLCache

_PENDING_CANCEL_TTL_SECONDS = 120.0


class PendingStreamCancelRegistry:
    def __init__(self, *, ttl_seconds: float = _PENDING_CANCEL_TTL_SECONDS) -> None:
        self._cache: TTLCache[tuple[int, str], bool] = TTLCache(
            maxsize=1024, ttl=max(float(ttl_seconds), 1.0)
        )

    def request_cancel(self, session_id: int, client_request_id: str) -> None:
        self._cache[(session_id, client_request_id)] = True

    def consume_cancel(self, session_id: int, client_request_id: str) -> bool:
        return self._cache.pop((session_id, client_request_id), None) is not None

    def clear(self, session_id: int, client_request_id: str) -> None:
        self._cache.pop((session_id, client_request_id), None)


pending_stream_cancel_registry = PendingStreamCancelRegistry()
