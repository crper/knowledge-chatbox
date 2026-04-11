"""Schema 共享校验类型。"""

import re
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, StringConstraints

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


def _validate_password_complexity(password: str) -> str:
    if len(password) < 8:
        return password
    categories = sum(
        1
        for pattern in (r"[a-z]", r"[A-Z]", r"\d", r"[^a-zA-Z0-9]")
        if re.search(pattern, password)
    )
    if categories < 3:
        raise ValueError(
            "Password must contain at least 3 of the following: "
            "lowercase letters, uppercase letters, digits, special characters."
        )
    return password


PasswordStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=8, max_length=255),
    BeforeValidator(_validate_password_complexity),
]
PositiveInt = Annotated[int, Field(gt=0)]
