"""Schema 共享校验类型。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

RoleLiteral = Literal["admin", "user"]
ThemeLiteral = Literal["light", "dark", "system"]
ProviderLiteral = Literal["openai", "anthropic", "voyage", "ollama"]
ResponseProviderLiteral = Literal["openai", "anthropic", "ollama"]
EmbeddingProviderLiteral = Literal["openai", "voyage", "ollama"]
VisionProviderLiteral = Literal["openai", "anthropic", "ollama"]
StatusLiteral = Literal["active", "disabled"]
ReasoningModeLiteral = Literal["default", "off", "on"]

UsernameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]
PasswordStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=8, max_length=255),
]
PositiveInt = Annotated[int, Field(gt=0)]
