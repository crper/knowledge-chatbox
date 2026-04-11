"""Typed runtime configuration loaded from the repository root `.env`."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from knowledge_chatbox_api.models.enums import ProviderName
from knowledge_chatbox_api.schemas._validators import (
    EmbeddingProviderLiteral,
    PositiveInt,
    ResponseProviderLiteral,
    VisionProviderLiteral,
    _validate_password_complexity,
)
from knowledge_chatbox_api.utils.helpers import unwrap_secret

# src/knowledge_chatbox_api/core/ → 5 levels up to repo root
PROJECT_ROOT = Path(__file__).resolve().parents[5]
EnvironmentLiteral = Literal["local", "test", "staging", "production"]
LogLevelLiteral = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class StorageSettings(BaseModel):
    """已解析的本地存储路径。"""

    data_dir: Path
    upload_dir: Path
    normalized_dir: Path
    sqlite_path: Path
    chroma_path: Path


class AuthSettings(BaseModel):
    """认证相关运行时设置。"""

    access_token_ttl_minutes: PositiveInt
    jwt_algorithm: str
    jwt_secret_key: str
    session_cookie_name: str
    session_cookie_secure: bool | None
    session_ttl_hours: PositiveInt
    login_rate_limit_attempts: PositiveInt
    login_rate_limit_window_seconds: PositiveInt
    initial_admin_username: str
    initial_admin_password: str


class ProviderBootstrapSettings(BaseModel):
    """provider bootstrap 相关运行时设置。"""

    initial_openai_api_key: str | None = None
    initial_openai_base_url: str
    initial_anthropic_api_key: str | None = None
    initial_anthropic_base_url: str
    initial_voyage_api_key: str | None = None
    initial_voyage_base_url: str
    initial_ollama_base_url: str
    initial_openai_chat_model: str
    initial_openai_embedding_model: str
    initial_openai_vision_model: str
    initial_anthropic_chat_model: str
    initial_anthropic_vision_model: str
    initial_voyage_embedding_model: str
    initial_ollama_chat_model: str
    initial_ollama_embedding_model: str
    initial_ollama_vision_model: str
    initial_response_provider: ResponseProviderLiteral
    initial_response_model: str
    initial_embedding_provider: EmbeddingProviderLiteral
    initial_embedding_model: str
    initial_vision_provider: VisionProviderLiteral
    initial_vision_model: str
    initial_provider_timeout_seconds: PositiveInt


class Settings(BaseSettings):
    """All runtime settings used by the API service."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Knowledge Chatbox API"
    environment: EnvironmentLiteral = "local"
    log_level: LogLevelLiteral = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_allow_origins: Annotated[tuple[str, ...], NoDecode] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    access_token_ttl_minutes: PositiveInt = 15
    jwt_algorithm: str = "HS256"
    jwt_secret_key: str = ""
    session_cookie_name: str = "knowledge_chatbox_session"
    session_cookie_secure: bool | None = None
    session_ttl_hours: PositiveInt = 24
    login_rate_limit_attempts: PositiveInt = 5
    login_rate_limit_window_seconds: PositiveInt = 300
    initial_admin_username: str = "admin"
    initial_admin_password: str = ""
    initial_openai_api_key: SecretStr | None = None
    initial_openai_base_url: str = "https://api.openai.com/v1"
    initial_anthropic_api_key: SecretStr | None = None
    initial_anthropic_base_url: str = "https://api.anthropic.com"
    initial_voyage_api_key: SecretStr | None = None
    initial_voyage_base_url: str = "https://api.voyageai.com/v1"
    initial_ollama_base_url: str = "http://localhost:11434"
    initial_openai_chat_model: str = "gpt-5.4"
    initial_openai_embedding_model: str = "text-embedding-3-small"
    initial_openai_vision_model: str = "gpt-5.4"
    initial_anthropic_chat_model: str = "claude-sonnet-4-5"
    initial_anthropic_vision_model: str = "claude-sonnet-4-5"
    initial_voyage_embedding_model: str = "voyage-3.5"
    initial_ollama_chat_model: str = "qwen3.5:4b"
    initial_ollama_embedding_model: str = "nomic-embed-text"
    initial_ollama_vision_model: str = "qwen3.5:4b"
    initial_response_provider: ResponseProviderLiteral = ProviderName.OLLAMA
    initial_response_model: str = "qwen3.5:4b"
    initial_embedding_provider: EmbeddingProviderLiteral = ProviderName.OLLAMA
    initial_embedding_model: str = "nomic-embed-text"
    initial_vision_provider: VisionProviderLiteral = ProviderName.OLLAMA
    initial_vision_model: str = "qwen3.5:4b"
    initial_provider_timeout_seconds: PositiveInt = 60
    max_upload_size_mb: PositiveInt = 100
    project_root: Path = Field(default_factory=lambda: PROJECT_ROOT)
    data_dir: Path = Field(default=Path("data"))
    upload_dir: Path = Field(default=Path("uploads"))
    normalized_dir: Path = Field(default=Path("normalized"))
    sqlite_path: Path = Field(default=Path("sqlite/ai_qa.db"))
    chroma_path: Path = Field(default=Path("chroma"))

    def _resolve_path(self, value: Path | None, default: Path) -> Path:
        if value is None:
            return default
        if value.is_absolute():
            return value
        return self.project_root / value

    def _resolve_path_field(self, field_name: str, value: Path, default: Path) -> Path:
        if field_name in self.model_fields_set:
            return self._resolve_path(value, default)
        return default

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _parse_cors_allow_origins(cls, value: object) -> object:
        """允许通过逗号分隔字符串或 JSON 数组配置 CORS 白名单。"""
        if value is None:
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return ()
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                return tuple(str(item).strip() for item in parsed if str(item).strip())
            return tuple(origin.strip() for origin in stripped.split(",") if origin.strip())
        if isinstance(value, (list, tuple, set)):
            return tuple(str(item).strip() for item in value if str(item).strip())
        return value

    @field_validator(
        "initial_openai_api_key",
        "initial_anthropic_api_key",
        "initial_voyage_api_key",
        mode="before",
    )
    @classmethod
    def _blank_secret_to_none(cls, value: object) -> object:
        """把空白 provider key 统一收敛为 None。"""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _resolve_runtime_paths(self) -> "Settings":
        project_root = self._resolve_path(self.project_root, PROJECT_ROOT)
        data_dir = self._resolve_path(self.data_dir, project_root / "data")

        self.project_root = project_root
        self.data_dir = data_dir
        self.upload_dir = self._resolve_path_field(
            "upload_dir", self.upload_dir, data_dir / "uploads"
        )
        self.normalized_dir = self._resolve_path_field(
            "normalized_dir", self.normalized_dir, data_dir / "normalized"
        )
        self.sqlite_path = self._resolve_path_field(
            "sqlite_path", self.sqlite_path, data_dir / "sqlite/ai_qa.db"
        )
        self.chroma_path = self._resolve_path_field(
            "chroma_path", self.chroma_path, data_dir / "chroma"
        )

        if not self.jwt_secret_key.strip():
            raise ValueError(
                "JWT_SECRET_KEY must be set and non-empty. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        if len(self.jwt_secret_key) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters long for adequate security."
            )
        if not self.initial_admin_password.strip():
            raise ValueError("INITIAL_ADMIN_PASSWORD must be set and non-empty.")
        if len(self.initial_admin_password) < 8:
            raise ValueError("INITIAL_ADMIN_PASSWORD must be at least 8 characters long.")
        _validate_password_complexity(self.initial_admin_password)

        if self.environment not in ("local", "test"):
            if self.jwt_secret_key == "knowledge-chatbox-dev-secret-key-32":
                raise ValueError(
                    "JWT_SECRET_KEY must be changed from the default value"
                    " in non-local environments"
                )
            if self.initial_admin_password == "admin123456":
                raise ValueError(
                    "INITIAL_ADMIN_PASSWORD must be changed from the default"
                    " value in non-local environments"
                )

        return self

    @property
    def storage(self) -> StorageSettings:
        """返回已解析的存储路径分组。"""
        return StorageSettings(
            data_dir=self.data_dir,
            upload_dir=self.upload_dir,
            normalized_dir=self.normalized_dir,
            sqlite_path=self.sqlite_path,
            chroma_path=self.chroma_path,
        )

    @property
    def auth(self) -> AuthSettings:
        """返回认证相关设置分组。"""
        return AuthSettings(
            access_token_ttl_minutes=self.access_token_ttl_minutes,
            jwt_algorithm=self.jwt_algorithm,
            jwt_secret_key=self.jwt_secret_key,
            session_cookie_name=self.session_cookie_name,
            session_cookie_secure=self.session_cookie_secure,
            session_ttl_hours=self.session_ttl_hours,
            login_rate_limit_attempts=self.login_rate_limit_attempts,
            login_rate_limit_window_seconds=self.login_rate_limit_window_seconds,
            initial_admin_username=self.initial_admin_username,
            initial_admin_password=self.initial_admin_password,
        )

    def should_use_secure_session_cookie(self, request_scheme: str) -> bool:
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        return request_scheme.lower() == "https"

    @property
    def provider_bootstrap(self) -> ProviderBootstrapSettings:
        return ProviderBootstrapSettings(
            initial_openai_api_key=unwrap_secret(self.initial_openai_api_key),
            initial_openai_base_url=self.initial_openai_base_url,
            initial_anthropic_api_key=unwrap_secret(self.initial_anthropic_api_key),
            initial_anthropic_base_url=self.initial_anthropic_base_url,
            initial_voyage_api_key=unwrap_secret(self.initial_voyage_api_key),
            initial_voyage_base_url=self.initial_voyage_base_url,
            initial_ollama_base_url=self.initial_ollama_base_url,
            initial_openai_chat_model=self.initial_openai_chat_model,
            initial_openai_embedding_model=self.initial_openai_embedding_model,
            initial_openai_vision_model=self.initial_openai_vision_model,
            initial_anthropic_chat_model=self.initial_anthropic_chat_model,
            initial_anthropic_vision_model=self.initial_anthropic_vision_model,
            initial_voyage_embedding_model=self.initial_voyage_embedding_model,
            initial_ollama_chat_model=self.initial_ollama_chat_model,
            initial_ollama_embedding_model=self.initial_ollama_embedding_model,
            initial_ollama_vision_model=self.initial_ollama_vision_model,
            initial_response_provider=self.initial_response_provider,
            initial_response_model=self.initial_response_model,
            initial_embedding_provider=self.initial_embedding_provider,
            initial_embedding_model=self.initial_embedding_model,
            initial_vision_provider=self.initial_vision_provider,
            initial_vision_model=self.initial_vision_model,
            initial_provider_timeout_seconds=self.initial_provider_timeout_seconds,
        )


@lru_cache
def get_settings() -> Settings:
    """Return one cached Settings object per process."""
    return Settings()
