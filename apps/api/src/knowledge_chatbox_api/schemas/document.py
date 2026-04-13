"""文档 Pydantic 模型定义。"""

from datetime import datetime

from pydantic import Field

from knowledge_chatbox_api.schemas import ReadOnlySchema


class DocumentRevisionRead(ReadOnlySchema):
    """描述文档修订响应体。

    Attributes:
        id: 修订版本 ID
        document_id: 所属文档 ID
        revision_no: 版本号
        source_filename: 源文件名
        mime_type: MIME 类型
        file_type: 文件类型
        ingest_status: 摄入状态
        content_hash: 内容哈希
        file_size: 文件大小（字节）
        chunk_count: 分块数量
        error_message: 错误消息
        supersedes_revision_id: 被替代的修订版本 ID
        created_by_user_id: 创建者用户 ID
        updated_by_user_id: 更新者用户 ID
        created_at: 创建时间
        updated_at: 更新时间
        indexed_at: 索引时间
    """

    id: int = Field(description="修订版本 ID")
    document_id: int = Field(description="所属文档 ID")
    revision_no: int = Field(description="版本号")
    source_filename: str = Field(description="源文件名")
    mime_type: str = Field(description="MIME 类型")
    file_type: str = Field(description="文件类型")
    ingest_status: str = Field(description="摄入状态")
    content_hash: str = Field(description="内容哈希")
    file_size: int | None = Field(default=None, description="文件大小（字节）")
    chunk_count: int | None = Field(default=None, description="分块数量")
    error_message: str | None = Field(default=None, description="错误消息")
    supersedes_revision_id: int | None = Field(default=None, description="被替代的修订版本 ID")
    created_by_user_id: int | None = Field(default=None, description="创建者用户 ID")
    updated_by_user_id: int | None = Field(default=None, description="更新者用户 ID")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")
    indexed_at: datetime | None = Field(default=None, description="索引时间")


class DocumentSummaryRead(ReadOnlySchema):
    """描述逻辑文档响应体。

    Attributes:
        id: 文档 ID
        space_id: 所属空间 ID
        title: 文档标题
        logical_name: 逻辑名称
        status: 状态
        latest_revision: 最新修订版本
        created_by_user_id: 创建者用户 ID
        updated_by_user_id: 更新者用户 ID
        created_at: 创建时间
        updated_at: 更新时间
    """

    id: int = Field(description="文档 ID")
    space_id: int = Field(description="所属空间 ID")
    title: str = Field(description="文档标题")
    logical_name: str = Field(description="逻辑名称")
    status: str = Field(description="状态")
    latest_revision: DocumentRevisionRead | None = Field(default=None, description="最新修订版本")
    created_by_user_id: int | None = Field(default=None, description="创建者用户 ID")
    updated_by_user_id: int | None = Field(default=None, description="更新者用户 ID")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")


class DocumentUploadRead(ReadOnlySchema):
    """描述上传接口响应体。

    Attributes:
        deduplicated: 是否已去重
        document: 文档摘要信息
        revision: 当前修订版本
        latest_revision: 最新修订版本
    """

    deduplicated: bool = Field(default=False, description="是否已去重")
    document: DocumentSummaryRead = Field(description="文档摘要信息")
    revision: DocumentRevisionRead = Field(description="当前修订版本")
    latest_revision: DocumentRevisionRead = Field(description="最新修订版本")


class DocumentUploadReadinessRead(ReadOnlySchema):
    """描述资源上传前置条件是否满足。

    Attributes:
        can_upload: 是否可以上传
        image_fallback: 是否使用图像降级处理
        blocking_reason: 阻止原因
    """

    can_upload: bool = Field(description="是否可以上传")
    image_fallback: bool = Field(description="是否使用图像降级处理")
    blocking_reason: str | None = Field(default=None, description="阻止原因")


class DocumentListSummaryRead(ReadOnlySchema):
    """描述资源列表的轻量摘要。

    Attributes:
        pending_count: 待处理数量
    """

    pending_count: int = Field(description="待处理数量")
