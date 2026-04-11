from __future__ import annotations

import threading
from time import monotonic

_PENDING_CANCEL_TTL_SECONDS = 120.0


class PendingStreamCancelRegistry:
    def __init__(self, *, ttl_seconds: float = _PENDING_CANCEL_TTL_SECONDS) -> None:
        self._ttl_seconds = max(float(ttl_seconds), 1.0)
        self._lock = threading.Lock()
        self._entries: dict[tuple[int, str], float] = {}

    def request_cancel(self, session_id: int, client_request_id: str) -> None:
        with self._lock:
            now = monotonic()
            self._prune_locked(now)
            self._entries[(session_id, client_request_id)] = now + self._ttl_seconds

    def consume_cancel(self, session_id: int, client_request_id: str) -> bool:
        with self._lock:
            now = monotonic()
            self._prune_locked(now)
            return self._entries.pop((session_id, client_request_id), None) is not None

    def clear(self, session_id: int, client_request_id: str) -> None:
        with self._lock:
            self._entries.pop((session_id, client_request_id), None)

    def _prune_locked(self, now: float) -> None:
        expired_keys = [key for key, expires_at in self._entries.items() if expires_at <= now]
        for key in expired_keys:
            self._entries.pop(key, None)


pending_stream_cancel_registry = PendingStreamCancelRegistry()
