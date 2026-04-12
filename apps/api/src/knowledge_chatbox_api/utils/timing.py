"""计时工具函数。"""

from datetime import UTC, datetime
from time import perf_counter


def elapsed_ms(started_at: float) -> int:
    return max(round((perf_counter() - started_at) * 1000), 0)


def utc_now() -> datetime:
    """返回当前 UTC 时间，方便测试时 mock 时间源。"""
    return datetime.now(UTC)
