"""空间数据模型定义。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from knowledge_chatbox_api.db.base import Base


class Space(Base):
    """单机 V1 下的唯一内容边界。"""

    __tablename__ = "spaces"
    __table_args__ = (CheckConstraint("kind IN ('personal')", name="ck_spaces_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="personal")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs) -> None:
        created_by_user_id = kwargs.pop("created_by_user_id", None)
        updated_by_user_id = kwargs.pop("updated_by_user_id", None)
        kwargs.pop("description", None)
        kwargs.pop("status", None)
        if kwargs.get("owner_user_id") is None:
            kwargs["owner_user_id"] = created_by_user_id or updated_by_user_id or 1
        super().__init__(**kwargs)
