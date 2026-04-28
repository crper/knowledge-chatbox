"""通用类型定义和类型别名。

本模块集中管理项目常用的类型别名和泛型约束，
避免在各处重复定义相同的类型。
"""

from datetime import datetime
from typing import Annotated, TypeVar

from pydantic import Field, StringConstraints

__all__ = [
    "ID",
    "DescriptionStr",
    "EmailStr",
    "LongTextStr",
    "NameStr",
    "NonEmptyStr",
    "NonNegativeInt",
    "PercentageFloat",
    "PositiveInt",
    "ProbabilityFloat",
    "Timestamp",
    "TrimmedStr",
    "URLStr",
]

ID = Annotated[int, Field(gt=0, description="唯一标识符")]
Timestamp = Annotated[datetime, Field(description="时间戳")]

NonEmptyStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
    Field(description="非空字符串"),
]

TrimmedStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True),
    Field(description="去除首尾空白字符串"),
]

EmailStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
    Field(pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", description="邮箱地址"),
]

URLStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2048),
    Field(pattern=r"^https?://", description="URL 地址"),
]

NameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    Field(description="名称字符串"),
]

DescriptionStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=0, max_length=1000),
    Field(description="描述字符串"),
]

LongTextStr = Annotated[
    str,
    StringConstraints(strip_whitespace=False, min_length=0, max_length=10000),
    Field(description="长文本字符串"),
]

PositiveInt = Annotated[int, Field(gt=0, description="正整数")]
NonNegativeInt = Annotated[int, Field(ge=0, description="非负整数")]
PercentageFloat = Annotated[float, Field(ge=0.0, le=100.0, description="百分比浮点数")]
ProbabilityFloat = Annotated[float, Field(ge=0.0, le=1.0, description="概率浮点数")]

T = TypeVar("T")
K = TypeVar("K")
V = TypeVar("V")
