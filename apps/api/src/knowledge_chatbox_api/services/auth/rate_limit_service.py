"""认证相关服务模块。"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta


class RateLimitService:
    """封装速率限制业务逻辑。"""

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 300,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.now_provider = now_provider or (lambda: datetime.now(UTC))
        self._attempts: dict[str, list[datetime]] = defaultdict(list)

    def is_limited(self, key: str) -> bool:
        """处理IsLimited相关逻辑。"""
        attempts = self._prune(key)
        return len(attempts) >= self.max_attempts

    def record_failure(self, key: str) -> None:
        """处理RecordFailure相关逻辑。"""
        attempts = self._prune(key)
        attempts.append(self.now_provider())
        self._attempts[key] = attempts

    def reset(self, key: str) -> None:
        """重置Reset。"""
        self._attempts.pop(key, None)

    def _prune(self, key: str) -> list[datetime]:
        now = self.now_provider()
        threshold = now - timedelta(seconds=self.window_seconds)
        attempts = [attempt for attempt in self._attempts.get(key, []) if attempt >= threshold]
        self._attempts[key] = attempts
        return attempts
