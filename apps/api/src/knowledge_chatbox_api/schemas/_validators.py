"""Schema 共享校验类型。"""

from typing import Annotated

from pydantic import BeforeValidator, Field, StringConstraints

from knowledge_chatbox_api.models.enums import (
    EmbeddingProvider,
    ReasoningMode,
    ResponseProvider,
    VisionProvider,
)

__all__ = [
    "CredentialPasswordStr",
    "EmbeddingProvider",
    "PasswordStr",
    "PositiveInt",
    "ReasoningMode",
    "ResponseProvider",
    "UsernameStr",
    "VisionProvider",
]

UsernameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]


def validate_password_complexity(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    categories = sum(
        [
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        ]
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
