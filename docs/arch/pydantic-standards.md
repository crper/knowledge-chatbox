# Pydantic 数据模型规范指南

本指南详细说明如何在 Knowledge Chatbox 项目中统一使用 Pydantic 作为数据模型定义的唯一解决方案。

## 目录

1. [核心原则](#核心原则)
2. [基础类层次结构](#基础类层次结构)
3. [使用场景](#使用场景)
4. [字段定义标准](#字段定义标准)
5. [验证器使用](#验证器使用)
6. [模型配置](#模型配置)
7. [最佳实践](#最佳实践)
8. [常见错误](#常见错误)

## 核心原则

### 1. 单一基类原则

所有数据模型必须继承自项目统一的基类，禁止直接使用 `pydantic.BaseModel`：

```python
# ❌ 错误示例
class MyModel(BaseModel):
    ...

# ✅ 正确示例
from knowledge_chatbox_api.schemas import BaseSchema

class MyModel(BaseSchema):
    ...
```

### 2. 声明式定义

使用 Pydantic 的声明式语法定义数据结构，避免手动类型检查：

```python
# ❌ 错误示例：手动类型检查
def validate_user(data):
    if not isinstance(data.get("username"), str):
        raise ValueError("Username must be a string")
    return data

# ✅ 正确示例：声明式验证
class UserInput(InputSchema):
    username: str = Field(min_length=3, max_length=64)
```

### 3. 类型安全优先

充分利用 Python 类型提示和 Pydantic 验证，提供编译时和运行时双重保障。

## 基础类层次结构

### BaseSchema - 通用基类

适用于大多数场景的数据模型：

```python
from knowledge_chatbox_api.schemas import BaseSchema

class UserRead(BaseSchema):
    id: int
    username: str
    email: str | None = None
```

**配置特点：**
- `extra="forbid"`: 禁止额外字段
- `populate_by_name=True`: 支持字段别名
- `from_attributes=True`: 支持 ORM 模式
- `str_strip_whitespace=True`: 自动去除字符串首尾空白

### ReadOnlySchema - 只读模型

适用于响应体、数据库读取记录等只读场景：

```python
from knowledge_chatbox_api.schemas import ReadOnlySchema

class DocumentSummaryRead(ReadOnlySchema):
    id: int
    title: str
    created_at: datetime
```

**配置特点：**
- `frozen=True`: 实例创建后不可修改
- 继承 BaseSchema 的所有其他特性

### InputSchema - 输入模型

适用于 API 请求体、用户输入等场景：

```python
from knowledge_chatbox_api.schemas import InputSchema

class CreateUserRequest(InputSchema):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8)
    email: str | None = None
```

**配置特点：**
- `extra="ignore"`: 忽略额外字段（向前兼容）
- `str_min_length=1`: 字符串最小长度为 1

### SettingsSchema - 配置模型

适用于应用配置、环境变量读取：

```python
from knowledge_chatbox_api.schemas import SettingsSchema

class AppSettings(SettingsSchema):
    app_name: str = "Knowledge Chatbox"
    debug: bool = False
    database_url: str
```

## 使用场景

### API 请求/响应

```python
# 请求模型
class CreateChatMessageRequest(InputSchema):
    content: str = Field(min_length=1, max_length=10000)
    attachments: list[ChatAttachmentInput] | None = None

# 响应模型
class ChatMessageRead(ReadOnlySchema):
    id: int
    content: str
    created_at: datetime

# 统一响应包裹
class Envelope[T](BaseSchema):
    success: bool
    data: T | None = None
    error: ErrorInfo | None = None
```

### 数据库交互

```python
# SQLAlchemy ORM 模型
class Document(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))

# Pydantic 模型（用于数据交换）
class DocumentRead(ReadOnlySchema):
    id: int
    title: str
    
    model_config = ConfigDict(from_attributes=True)

# 使用示例
document = session.get(Document, 1)
document_read = DocumentRead.model_validate(document, from_attributes=True)
```

### 服务间通信

```python
# 定义统一的数据传输对象
class DocumentUploadResult(BaseSchema):
    document_id: int
    revision_id: int
    status: str
    error_message: str | None = None

# 在服务层使用
def upload_document(...) -> DocumentUploadResult:
    ...
    return DocumentUploadResult(
        document_id=doc_id,
        revision_id=rev_id,
        status="indexed"
    )
```

## 字段定义标准

### 基础类型

```python
from pydantic import Field
from knowledge_chatbox_api.schemas.types import (
    ID,
    NonEmptyStr,
    PositiveInt,
    EmailStr,
    PercentageFloat,
)

class UserInput(InputSchema):
    # 使用预定义类型
    id: ID
    username: NonEmptyStr
    email: EmailStr
    
    # 使用 Field 定义约束
    age: int = Field(ge=0, le=150, description="年龄")
    bio: str = Field(
        min_length=0,
        max_length=1000,
        description="个人简介",
        default=""
    )
```

### 复杂类型

```python
from datetime import datetime
from typing import Annotated
from pydantic import Field

class ArticleInput(InputSchema):
    # 列表类型
    tags: list[str] = Field(default_factory=list, description="标签列表")
    
    # 字典类型
    metadata: dict[str, str] = Field(default_factory=dict, description="元数据")
    
    # 嵌套模型
    author: AuthorInfo = Field(description="作者信息")
    
    # 可选类型
    published_at: datetime | None = Field(default=None, description="发布时间")
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")
```

### 字段别名

```python
from pydantic import AliasChoices, Field

class ChatAttachmentInput(BaseSchema):
    # 支持多个别名
    document_id: int | None = Field(
        default=None,
        validation_alias=AliasChoices("document_id", "resource_document_id"),
        description="文档 ID"
    )
```

## 验证器使用

### 字段验证器

```python
from pydantic import field_validator
from knowledge_chatbox_api.schemas.validators import (
    validate_username,
    validate_password_strength,
    validate_email_format,
)

class UserInput(InputSchema):
    username: str
    password: str
    email: str
    
    # 使用预定义验证器
    _validate_username = field_validator("username")(validate_username())
    _validate_password = field_validator("password")(validate_password_strength())
    _validate_email = field_validator("email")(validate_email_format())
    
    # 自定义字段验证器
    @field_validator("username")
    @classmethod
    def check_username_not_reserved(cls, v: str) -> str:
        if v.lower() in ["admin", "root", "system"]:
            raise ValueError("不能使用保留用户名")
        return v
```

### 模型验证器

```python
from pydantic import model_validator
from datetime import datetime

class EventInput(InputSchema):
    start_time: datetime
    end_time: datetime
    
    @model_validator(mode="after")
    def check_dates_in_order(self) -> "EventInput":
        if self.end_time < self.start_time:
            raise ValueError("结束时间不能早于开始时间")
        return self
```

### 预定义验证器库

项目提供常用验证器工具集：

```python
from knowledge_chatbox_api.schemas.validators import (
    validate_username,              # 用户名验证
    validate_password_strength,     # 密码强度验证
    validate_email_format,          # 邮箱格式验证
    validate_url_format,            # URL 格式验证
    validate_json_string,           # JSON 字符串验证
    normalize_whitespace,           # 空白字符标准化
    validate_date_range,            # 日期范围验证
    validate_positive_number,       # 正数验证
    validate_percentage,            # 百分比验证
    validate_unique_list,           # 列表唯一性验证
    validate_non_empty_list,        # 非空列表验证
)
```

## 模型配置

### ConfigDict 配置项

```python
from pydantic import ConfigDict

class MyModel(BaseSchema):
    model_config = ConfigDict(
        # 额外字段处理
        extra="forbid",  # 'forbid' | 'ignore' | 'allow'
        
        # 别名支持
        populate_by_name=True,
        
        # ORM 模式
        from_attributes=True,
        
        # 冻结实例
        frozen=False,
        
        # 字符串处理
        str_strip_whitespace=True,
        str_min_length=0,
        str_max_length=None,
        
        # JSON 序列化
        json_encoders={
            datetime: lambda v: v.isoformat(),
        },
    )
```

### 特殊配置场景

**允许额外字段（用于动态数据）：**
```python
class UsageData(BaseSchema):
    model_config = BaseSchema.model_config.copy()
    model_config["extra"] = "allow"
    
    request_tokens: int | None = None
```

**只读模型（响应体）：**
```python
from knowledge_chatbox_api.schemas import ReadOnlySchema

class DocumentRead(ReadOnlySchema):
    # frozen=True 自动生效
    id: int
    title: str
```

## 最佳实践

### 1. 命名规范

```python
# 请求模型：以 Request 结尾
class CreateUserRequest(InputSchema): ...
class UpdateSettingsRequest(InputSchema): ...

# 响应模型：以 Read/Result/Response 结尾
class UserRead(ReadOnlySchema): ...
class DeleteResult(ReadOnlySchema): ...
class ChatResponse(ReadOnlySchema): ...

# 数据传输对象：以 DTO 结尾
class DocumentDTO(BaseSchema): ...
```

### 2. 文档注释

所有模型应包含完整的文档字符串：

```python
class ChatMessageRead(ReadOnlySchema):
    """聊天消息响应体。
    
    Attributes:
        id: 消息 ID
        content: 消息内容
        created_at: 创建时间
    """
    
    id: int = Field(description="消息 ID")
    content: str = Field(description="消息内容")
    created_at: datetime = Field(description="创建时间")
```

### 3. 默认值策略

```python
# ✅ 推荐：使用 Field 定义默认值
class MyModel(BaseSchema):
    tags: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    status: str = Field(default="active")

# ❌ 避免：可变类型直接赋值
class MyModel(BaseModel):
    tags: list[str] = []  # 危险！
```

### 4. 序列化控制

```python
from pydantic import Field, computed_field

class UserRead(ReadOnlySchema):
    password_hash: str = Field(exclude=True, description="密码哈希")
    first_name: str
    last_name: str
    
    @computed_field
    @property
    def full_name(self) -> str:
        """计算字段，自动包含在序列化结果中"""
        return f"{self.first_name} {self.last_name}"
```

### 5. 模型组合

```python
# 使用嵌套模型
class AddressInput(InputSchema):
    street: str
    city: str
    zip_code: str

class UserInput(InputSchema):
    username: str
    address: AddressInput  # 嵌套模型

# 使用泛型包裹
class PaginatedResponse[T](BaseSchema):
    items: list[T]
    total: int
    page: int
    page_size: int
```

## 常见错误

### 1. 循环导入

```python
# ❌ 错误：循环导入
# file_a.py
from file_b import ModelB

class ModelA(BaseSchema):
    b: ModelB

# file_b.py
from file_a import ModelA  # 循环依赖！

class ModelB(BaseSchema):
    a: ModelA

# ✅ 正确：使用 TYPE_CHECKING 和字符串注解
# file_a.py
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from file_b import ModelB

class ModelA(BaseSchema):
    b: "ModelB"
```

### 2. 可变默认值

```python
# ❌ 错误
class MyModel(BaseModel):
    tags: list[str] = []

# ✅ 正确
class MyModel(BaseSchema):
    tags: list[str] = Field(default_factory=list)
```

### 3. 忽略类型提示

```python
# ❌ 错误：缺少类型提示
class MyModel(BaseSchema):
    name = Field()  # 类型不明确

# ✅ 正确
class MyModel(BaseSchema):
    name: str = Field()  # 明确的类型
```

### 4. 过度使用 Any

```python
# ❌ 避免
class MyModel(BaseSchema):
    data: Any

# ✅ 推荐：使用 Union 或泛型
from typing import Union, Generic, TypeVar

T = TypeVar("T")

class MyModel(BaseSchema, Generic[T]):
    data: T | None = None

# 或使用明确的 Union
class MyModel(BaseSchema):
    data: str | int | dict | None = None
```

## 迁移指南

### 从旧模型迁移

1. **识别旧模型**：查找所有直接继承 `BaseModel` 的类
2. **选择合适基类**：根据使用场景选择 BaseSchema/ReadOnlySchema/InputSchema
3. **添加 Field 描述**：为所有字段添加 description
4. **更新导入**：使用统一导入路径
5. **运行测试**：确保类型检查和功能测试通过

### 示例迁移

```python
# 迁移前
from pydantic import BaseModel, ConfigDict

class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    title: str
    status: str

# 迁移后
from knowledge_chatbox_api.schemas import ReadOnlySchema
from pydantic import Field

class DocumentRead(ReadOnlySchema):
    """文档读取模型。
    
    Attributes:
        id: 文档 ID
        title: 文档标题
        status: 文档状态
    """
    
    id: int = Field(description="文档 ID")
    title: str = Field(description="文档标题")
    status: str = Field(description="文档状态")
```

## 总结

通过统一使用 Pydantic 作为数据模型定义的唯一解决方案，我们可以：

- ✅ **提升代码一致性**：统一的数据处理模式
- ✅ **增强可读性**：声明式模型定义
- ✅ **强化类型安全**：编译时和运行时双重保障
- ✅ **降低维护成本**：集中管理验证逻辑
- ✅ **减少运行时错误**：严格的输入验证

所有新开发功能必须遵循此规范，现有代码应逐步重构以符合标准。
