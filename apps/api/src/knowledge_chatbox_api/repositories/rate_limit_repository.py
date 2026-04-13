"""Rate limit attempt persistence."""

from datetime import timedelta

from sqlalchemy import delete, func, select

from knowledge_chatbox_api.models.auth import RateLimitAttempt
from knowledge_chatbox_api.repositories.base import BaseRepository
from knowledge_chatbox_api.utils.timing import utc_now


class RateLimitRepository(BaseRepository[RateLimitAttempt]):
    model_type = RateLimitAttempt

    def count_recent_attempts(self, key: str, window_seconds: int) -> int:
        threshold = utc_now() - timedelta(seconds=window_seconds)
        result = self.session.scalar(
            select(func.count())
            .select_from(RateLimitAttempt)
            .where(
                RateLimitAttempt.key == key,
                RateLimitAttempt.attempted_at >= threshold,
            )
        )
        return result if result is not None else 0

    def record_attempt(self, key: str) -> None:
        self.add(RateLimitAttempt(key=key))

    def reset_attempts(self, key: str) -> None:
        self.session.execute(delete(RateLimitAttempt).where(RateLimitAttempt.key == key))

    def cleanup_stale(self, window_seconds: int) -> None:
        threshold = utc_now() - timedelta(seconds=window_seconds)
        self.session.execute(
            delete(RateLimitAttempt).where(RateLimitAttempt.attempted_at < threshold)
        )
