"""Schema 共享校验类型。"""

import re
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, StringConstraints

ResponseProviderLiteral = Literal["openai", "anthropic", "ollama"]
EmbeddingProviderLiteral = Literal["openai", "voyage", "ollama"]
VisionProviderLiteral = Literal["openai", "anthropic", "ollama"]
ReasoningModeLiteral = Literal["default", "off", "on"]

UsernameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]


def validate_password_complexity(password: str) -> str:
    if len(password) < 8:
        return password  # 短密码由 min_length 约束处理，此处仅跳过复杂度检查
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
    BeforeValidator(validate_password_complexity),
]

CredentialPasswordStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=1, max_length=255),
]
PositiveInt = Annotated[int, Field(gt=0)]
