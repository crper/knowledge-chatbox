"""认证相关服务模块。"""

import random
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import cached_property

from cachetools import TTLCache

_MAX_KEYS_BEFORE_FULL_PRUNE = 1024
_MEMORY_CACHE_TTL = 1.0
_PROBABILISTIC_CLEANUP_THRESHOLD = 0.01


class RateLimitService:
    """封装速率限制业务逻辑。

    真源为数据库 ``rate_limit_attempts`` 表，确保多 worker 部署下限流一致。
    进程内短期内存缓存（1s TTL）用于减少高频登录场景下的 DB 查询。

    当 ``rate_limit_repository`` 为 None 时，退化为进程内内存限流，
    此时 ``now_provider`` 用于控制时间源；DB 模式下时间由数据库记录的
    ``attempted_at`` 字段决定，``now_provider`` 不生效。
    """

    def __init__(
        self,
        rate_limit_repository=None,
        *,
        max_attempts: int = 5,
        window_seconds: int = 300,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = rate_limit_repository
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.now_provider = now_provider or (lambda: datetime.now(UTC))
        self._memory_cache: TTLCache[str, int] = TTLCache(
            maxsize=_MAX_KEYS_BEFORE_FULL_PRUNE, ttl=_MEMORY_CACHE_TTL
        )

    def startup_cleanup(self) -> None:
        """启动时清理过期的限流记录，防止低流量场景下表无限增长。"""
        if self.repository is not None:
            self.repository.cleanup_stale(self.window_seconds)
            self.repository.session.commit()
            self._memory_cache.clear()

    def is_limited(self, key: str) -> bool:
        if self.repository is not None:
            cached_count = self._memory_cache.get(key, 0)
            if cached_count >= self.max_attempts:
                return True
            db_count = self.repository.count_recent_attempts(key, self.window_seconds)
            self._memory_cache[key] = db_count
            return db_count >= self.max_attempts
        now = self.now_provider()
        threshold = now - timedelta(seconds=self.window_seconds)
        attempts = [a for a in self._fallback_attempts.get(key, []) if a >= threshold]
        return len(attempts) >= self.max_attempts

    def record_failure(self, key: str) -> None:
        if self.repository is not None:
            self.repository.record_attempt(key)
            self.repository.session.commit()
            db_count = self.repository.count_recent_attempts(key, self.window_seconds)
            self._memory_cache[key] = db_count
            self._maybe_cleanup_stale()
        else:
            now = self.now_provider()
            threshold = now - timedelta(seconds=self.window_seconds)
            self._fallback_attempts[key] = [
                a for a in self._fallback_attempts.get(key, []) if a >= threshold
            ]
            self._fallback_attempts[key].append(now)

    def reset(self, key: str) -> None:
        if self.repository is not None:
            self.repository.reset_attempts(key)
            self.repository.session.commit()
            self._memory_cache.pop(key, None)
        else:
            self._fallback_attempts.pop(key, None)

    def _maybe_cleanup_stale(self) -> None:
        if self.repository is None:
            return
        if len(self._memory_cache) >= _MAX_KEYS_BEFORE_FULL_PRUNE:
            self.repository.cleanup_stale(self.window_seconds)
            self.repository.session.commit()
            self._memory_cache.clear()
            return
        if random.random() < _PROBABILISTIC_CLEANUP_THRESHOLD:  # noqa: S311  # 伪随机足以决定是否清理过期记录
            self.repository.cleanup_stale(self.window_seconds)
            self.repository.session.commit()

    @cached_property
    def _fallback_attempts(self) -> dict[str, list[datetime]]:
        return defaultdict(list)
