"""Capability health-check helpers."""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor


def run_parallel_checks[T](checks: dict[str, Callable[[], T]]) -> dict[str, T]:
    """Run independent capability checks concurrently and preserve key order."""

    with ThreadPoolExecutor(max_workers=len(checks)) as executor:
        futures = {name: executor.submit(check) for name, check in checks.items()}
        return {name: futures[name].result() for name in checks}
