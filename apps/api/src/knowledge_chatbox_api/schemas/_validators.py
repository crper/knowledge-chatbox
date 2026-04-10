"""Schema 共享校验类型。"""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from knowledge_chatbox_api.models.enums import (
    IngestStatus,
    ProviderName,
    ReasoningMode,
    ThemePreference,
    UserRole,
    UserStatus,
)

RoleLiteral = UserRole
ThemeLiteral = ThemePreference
ProviderLiteral = ProviderName
ResponseProviderLiteral = Literal[
    ProviderName.OPENAI,
    ProviderName.ANTHROPIC,
    ProviderName.OLLAMA,
]
EmbeddingProviderLiteral = Literal[
    ProviderName.OPENAI,
    ProviderName.VOYAGE,
    ProviderName.OLLAMA,
]
VisionProviderLiteral = Literal[
    ProviderName.OPENAI,
    ProviderName.ANTHROPIC,
    ProviderName.OLLAMA,
]
StatusLiteral = UserStatus
ReasoningModeLiteral = ReasoningMode
IngestStatusLiteral = IngestStatus

UsernameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]
PasswordStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=8, max_length=255),
]
PositiveInt = Annotated[int, Field(gt=0)]
