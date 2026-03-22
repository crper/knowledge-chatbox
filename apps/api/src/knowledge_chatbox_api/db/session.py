"""SQLAlchemy engine and session factory lifecycle."""

from __future__ import annotations

from collections.abc import Generator
from functools import cache

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from knowledge_chatbox_api.core.config import get_settings

SQLITE_BUSY_TIMEOUT_MS = 30_000


@cache
def _create_engine(sqlite_path: str) -> Engine:
    """Build one engine per SQLite path so requests share the same connection pool."""
    engine = create_engine(
        f"sqlite:///{sqlite_path}",
        future=True,
        connect_args={"timeout": SQLITE_BUSY_TIMEOUT_MS / 1000},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # type: ignore[no-untyped-def]
        """Enable SQLite pragmas that make mixed read/write traffic more resilient."""
        del connection_record
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.fetchone()
        cursor.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    return engine


def create_db_engine() -> Engine:
    """Return the cached engine for the configured SQLite database."""
    settings = get_settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return _create_engine(str(settings.sqlite_path))


@cache
def _create_session_factory(sqlite_path: str) -> sessionmaker[Session]:
    """Build one sessionmaker per SQLite path."""
    engine = _create_engine(sqlite_path)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def create_session_factory() -> sessionmaker[Session]:
    """Return the cached session factory for the configured SQLite database."""
    settings = get_settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return _create_session_factory(str(settings.sqlite_path))


def get_db_session() -> Generator[Session, None, None]:
    """Yield one request-scoped SQLAlchemy session."""
    session_factory = create_session_factory()
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
