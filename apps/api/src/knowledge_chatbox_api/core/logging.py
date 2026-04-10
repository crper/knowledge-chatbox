"""Logging核心模块。"""

import logging
import sys

import structlog
from asgi_correlation_id import correlation_id
from structlog.contextvars import merge_contextvars


def _add_request_id(_, __, event_dict: dict) -> dict:
    request_id = correlation_id.get()
    if request_id:
        event_dict["request_id"] = request_id
    return event_dict


def _build_renderer(environment: str):
    if environment == "local":
        return structlog.dev.ConsoleRenderer(colors=False)
    return structlog.processors.JSONRenderer(sort_keys=True)


def setup_logging(level: str = "INFO", environment: str = "local") -> None:
    """初始化应用日志配置。"""
    shared_processors = [
        merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_request_id,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]
    if environment != "local":
        shared_processors.append(structlog.processors.format_exc_info)
    renderer = _build_renderer(environment)
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level.upper())

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    """返回 structlog logger。"""
    return structlog.get_logger(name)
