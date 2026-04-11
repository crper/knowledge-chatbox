"""应用入口与启动初始化。"""

import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any

from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from structlog.contextvars import bind_contextvars, clear_contextvars

from knowledge_chatbox_api import __version__
from knowledge_chatbox_api.api.deps import get_settings
from knowledge_chatbox_api.api.openapi import (
    API_DESCRIPTION,
    API_SUMMARY,
    OPENAPI_TAGS,
)
from knowledge_chatbox_api.api.routes.auth import router as auth_router
from knowledge_chatbox_api.api.routes.chat import router as chat_router
from knowledge_chatbox_api.api.routes.documents import router as documents_router
from knowledge_chatbox_api.api.routes.health import router as health_router
from knowledge_chatbox_api.api.routes.settings import router as settings_router
from knowledge_chatbox_api.api.routes.users import router as users_router
from knowledge_chatbox_api.core.errors import AppError
from knowledge_chatbox_api.core.logging import get_logger, setup_logging
from knowledge_chatbox_api.core.security import PasswordManager
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.schemas.common import Envelope, ErrorInfo
from knowledge_chatbox_api.services.auth.auth_service import AuthService
from knowledge_chatbox_api.services.auth.rate_limit_service import RateLimitService
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.tasks.document_jobs import (
    compensate_active_chat_runs,
    compensate_index_rebuild_status,
    compensate_processing_documents,
)
from knowledge_chatbox_api.utils.chroma import get_chroma_store
from knowledge_chatbox_api.utils.timing import elapsed_ms


def _error_response(status_code: int, error: ErrorInfo) -> JSONResponse:
    """用统一 Envelope 结构返回错误响应。"""
    payload = Envelope(success=False, data=None, error=error)
    return JSONResponse(status_code=status_code, content=payload.model_dump())


def _detail_to_error_info(
    detail: Any,
    *,
    default_code: str,
    default_message: str,
) -> ErrorInfo:
    """把任意 detail 收紧为 ErrorInfo。"""
    if isinstance(detail, ErrorInfo):
        return detail
    if isinstance(detail, dict):
        try:
            return ErrorInfo.model_validate(detail)
        except Exception:  # noqa: BLE001
            pass
    if isinstance(detail, list):
        return ErrorInfo(code=default_code, message=default_message, details=detail)
    return ErrorInfo(code=default_code, message=str(detail) or default_message)


def _json_safe(value: Any) -> Any:
    """把错误细节收敛为 JSON 可序列化结构。"""
    if isinstance(value, BaseException):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, set):
        return [_json_safe(item) for item in value]
    return value


def _raise_if_database_schema_incompatible(error: OperationalError) -> None:
    """在数据库未迁移或 schema 过旧时抛出更明确的错误。"""
    message = str(error.orig).lower() if error.orig is not None else str(error).lower()
    if "no such table:" in message:
        settings = get_settings()
        try:
            with sqlite3.connect(settings.sqlite_path) as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    ).fetchall()
                }
        except sqlite3.Error:
            tables = set()

        if "alembic_version" in tables:
            raise RuntimeError(
                "检测到旧 schema/旧迁移历史，请执行 `just reset-data` 后再启动当前版本。"
            ) from None
        raise RuntimeError(
            "数据库尚未初始化。请先在仓库根目录执行 `just api-migrate`"
            "（或在 apps/api 目录执行 `uv run python -m alembic upgrade head`），"
            "再启动 API 服务。"
        ) from None

    if "no such column:" in message or "has no column named" in message:
        raise RuntimeError(
            "检测到旧 schema/旧迁移历史，请执行 `just reset-data` 后再启动当前版本。"
        ) from None

    if "no such" not in message:
        return


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用。"""
    settings = get_settings()
    setup_logging(settings.log_level, settings.environment)
    logger = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        """在应用启动时完成默认数据与运行时初始化。"""
        session_factory = create_session_factory()
        with session_factory() as session:
            auth_service = AuthService(
                session=session,
                settings=settings,
                password_manager=PasswordManager(),
                rate_limit_service=RateLimitService(
                    max_attempts=settings.login_rate_limit_attempts,
                    window_seconds=settings.login_rate_limit_window_seconds,
                ),
            )
            try:
                startup_durations_ms: dict[str, float] = {}

                def run_startup_step(name: str, operation):
                    started_at = perf_counter()
                    result = operation()
                    startup_durations_ms[name] = elapsed_ms(started_at)
                    return result

                admin = run_startup_step("ensure_default_admin", auth_service.ensure_default_admin)
                run_startup_step(
                    "ensure_personal_space",
                    lambda: SpaceRepository(session).ensure_personal_space(user_id=admin.id),
                )
                settings_service = SettingsService(session, settings)
                run_startup_step(
                    "ensure_app_settings",
                    settings_service.get_or_create_settings_record,
                )
                compensated_documents = run_startup_step(
                    "compensate_processing_documents",
                    lambda: compensate_processing_documents(session, settings),
                )
                compensated_runs = run_startup_step(
                    "compensate_active_chat_runs",
                    lambda: compensate_active_chat_runs(session),
                )
                compensated_rebuild = run_startup_step(
                    "compensate_index_rebuild_status",
                    lambda: compensate_index_rebuild_status(session, settings),
                )
                run_startup_step(
                    "warmup_chroma_collection",
                    lambda: get_chroma_store().warmup(
                        SettingsService(session, settings)
                        .get_or_create_settings_record()
                        .active_index_generation
                    ),
                )
                logger.info(
                    "Startup compensation completed",
                    admin_id=admin.id,
                    compensated_documents=compensated_documents,
                    compensated_runs=compensated_runs,
                    compensated_index_rebuild=compensated_rebuild,
                    startup_durations_ms=startup_durations_ms,
                )
            except OperationalError as error:
                _raise_if_database_schema_incompatible(error)
                raise
        yield

    is_production = settings.environment == "production"

    app = FastAPI(
        title=settings.app_name,
        summary=API_SUMMARY,
        description=API_DESCRIPTION,
        version=__version__,
        docs_url="/docs" if not is_production else None,
        redoc_url="/redoc" if not is_production else None,
        openapi_url="/openapi.json" if not is_production else None,
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
    )
    app.add_middleware(CorrelationIdMiddleware)

    if settings.cors_allow_origins:
        if "*" in settings.cors_allow_origins:
            raise RuntimeError(
                "CORS_ALLOW_ORIGINS cannot contain '*'. Specify explicit origins instead."
            )
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_allow_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Accept", "X-Correlation-ID"],
        )

    @app.middleware("http")
    async def bind_request_context(request: Request, call_next):
        """绑定请求级日志上下文并记录基础访问日志。"""
        clear_contextvars()
        bind_contextvars(
            request_method=request.method,
            request_path=request.url.path,
        )
        response = await call_next(request)
        bind_contextvars(status_code=response.status_code)
        logger.info("HTTP request completed")
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        """把应用异常转换为统一响应结构。"""
        logger.warning(
            "Application error returned",
            request_method=request.method,
            request_path=request.url.path,
            status_code=exc.status_code,
            error_code=exc.code,
        )
        return _error_response(exc.status_code, exc.to_error_info())

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """把请求校验错误转换为统一响应结构。"""
        logger.warning(
            "Request validation error returned",
            request_method=request.method,
            request_path=request.url.path,
            status_code=422,
        )
        return _error_response(
            422,
            ErrorInfo(
                code="validation_error",
                message="Request validation failed.",
                details=_json_safe(exc.errors()),
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        """兼容框架或遗留逻辑抛出的 HTTPException。"""
        logger.warning(
            "HTTP exception returned",
            request_method=request.method,
            request_path=request.url.path,
            status_code=exc.status_code,
        )
        return _error_response(
            exc.status_code,
            _detail_to_error_info(
                exc.detail,
                default_code="http_error",
                default_message="HTTP error.",
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        """兜底处理未知异常，避免泄露内部细节。"""
        logger.exception(
            "Unhandled exception returned",
            request_method=request.method,
            request_path=request.url.path,
        )
        return _error_response(
            500,
            ErrorInfo(code="internal_error", message="Internal server error."),
        )

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(chat_router)
    app.include_router(documents_router)
    app.include_router(settings_router)
    app.include_router(users_router)

    return app


app = create_app()
