"""SQLAlchemy engine and session factory lifecycle."""

import contextlib
from collections.abc import Generator
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from knowledge_chatbox_api.core.config import get_settings

SQLITE_BUSY_TIMEOUT_MS = 30_000

# 用于跟踪当前缓存的 engine，以便在 reset 时 dispose
_current_engine: Engine | None = None


@lru_cache(maxsize=1)
def _create_engine(sqlite_path: str) -> Engine:
    """Build one engine per SQLite path so requests share the same connection pool."""
    global _current_engine
    engine = create_engine(
        f"sqlite:///{sqlite_path}",
        future=True,
        connect_args={"timeout": SQLITE_BUSY_TIMEOUT_MS / 1000},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
        """Enable SQLite pragmas that make mixed read/write traffic more resilient."""
        del connection_record
        cursor: Any = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.fetchone()
        cursor.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA synchronous = NORMAL")
        cursor.close()

    _current_engine = engine
    return engine


def create_db_engine() -> Engine:
    """Return the cached engine for the configured SQLite database."""
    settings = get_settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return _create_engine(str(settings.sqlite_path))


@lru_cache(maxsize=1)
def _create_session_factory(sqlite_path: str) -> sessionmaker[Session]:
    """Build one sessionmaker per SQLite path."""
    engine = _create_engine(sqlite_path)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def create_session_factory() -> sessionmaker[Session]:
    """Return the cached session factory for the configured SQLite database."""
    settings = get_settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return _create_session_factory(str(settings.sqlite_path))


def get_db_session() -> Generator[Session]:
    """Yield one request-scoped SQLAlchemy session.

    On normal return the session is committed; on exception it is rolled back.
    Either way the session is closed in the ``finally`` block.
    """
    session_factory = create_session_factory()
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_db_caches() -> None:
    """Clear cached engine and session factory so they are rebuilt on next access."""
    global _current_engine
    # 先 dispose 当前 engine 释放连接池中的连接
    if _current_engine is not None:
        with contextlib.suppress(Exception):
            _current_engine.dispose()
        _current_engine = None
    _create_session_factory.cache_clear()
    _create_engine.cache_clear()
