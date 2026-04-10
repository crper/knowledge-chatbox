"""计时工具函数。"""

from time import perf_counter


def elapsed_ms(started_at: float) -> int:
    return max(int(round((perf_counter() - started_at) * 1000)), 0)
