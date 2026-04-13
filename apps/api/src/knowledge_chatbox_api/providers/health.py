"""Capability health-check helpers."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import TYPE_CHECKING, TypeVar

from knowledge_chatbox_api.providers.base import ProviderHealthResult

if TYPE_CHECKING:
    from collections.abc import Callable

    from knowledge_chatbox_api.schemas.settings import (
        ProviderConnectionTestRead,
        ProviderRuntimeSettings,
    )

T = TypeVar("T")

_DEFAULT_CHECK_TIMEOUT_SECONDS = 15


def run_parallel_checks[T](
    checks: dict[str, Callable[[], T]],
    *,
    timeout_seconds: float = _DEFAULT_CHECK_TIMEOUT_SECONDS,
) -> dict[str, T | ProviderHealthResult]:
    """并行执行独立的 capability 健康检查，保留键顺序。

    单个检查超时或异常不会阻塞其他检查，而是返回一个 unhealthy 的
    ProviderHealthResult 代替原始返回值。

    Args:
        checks: 检查名称到检查函数的映射
        timeout_seconds: 单个检查的超时时间（秒）
    """
    with ThreadPoolExecutor(max_workers=len(checks)) as executor:
        futures = {name: executor.submit(check) for name, check in checks.items()}
        results: dict[str, T | ProviderHealthResult] = {}
        for name in checks:
            try:
                results[name] = futures[name].result(timeout=timeout_seconds)
            except TimeoutError:
                results[name] = ProviderHealthResult(
                    healthy=False,
                    message=f"Health check timed out after {timeout_seconds}s.",
                )
            except Exception as exc:
                results[name] = ProviderHealthResult(
                    healthy=False,
                    message=f"Health check failed: {exc}",
                )
        return results


def run_capability_health_checks(
    runtime_settings: ProviderRuntimeSettings,
) -> dict[str, ProviderHealthResult]:
    """并行执行 response/embedding/vision 三项 capability 健康检查。

    Args:
        runtime_settings: 运行时 provider 设置
    """
    from knowledge_chatbox_api.providers.factory import (
        build_embedding_adapter,
        build_response_adapter,
        build_vision_adapter,
    )

    return run_parallel_checks(
        {
            "response": lambda: build_response_adapter(
                runtime_settings.response_route
            ).health_check(runtime_settings),
            "embedding": lambda: build_embedding_adapter(
                runtime_settings.embedding_route
            ).health_check(runtime_settings),
            "vision": lambda: build_vision_adapter(runtime_settings.vision_route).health_check(
                runtime_settings
            ),
        }
    )


def build_connection_test_read(
    runtime_settings: ProviderRuntimeSettings,
    results: dict[str, ProviderHealthResult],
) -> ProviderConnectionTestRead:
    """从健康检查结果构建 ProviderConnectionTestRead 响应体。

    Args:
        runtime_settings: 运行时 provider 设置
        results: run_capability_health_checks 返回的检查结果
    """
    from knowledge_chatbox_api.schemas.settings import (
        CapabilityHealthRead,
        ProviderConnectionTestRead,
    )

    return ProviderConnectionTestRead(
        response=CapabilityHealthRead(
            provider=runtime_settings.response_route.provider,
            model=runtime_settings.response_route.model,
            healthy=results["response"].healthy,
            message=results["response"].message,
            latency_ms=results["response"].latency_ms,
        ),
        embedding=CapabilityHealthRead(
            provider=runtime_settings.embedding_route.provider,
            model=runtime_settings.embedding_route.model,
            healthy=results["embedding"].healthy,
            message=results["embedding"].message,
            latency_ms=results["embedding"].latency_ms,
        ),
        vision=CapabilityHealthRead(
            provider=runtime_settings.vision_route.provider,
            model=runtime_settings.vision_route.model,
            healthy=results["vision"].healthy,
            message=results["vision"].message,
            latency_ms=results["vision"].latency_ms,
        ),
    )
