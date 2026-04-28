from __future__ import annotations

from typing import TYPE_CHECKING, TypeVar

from advanced_alchemy.repository import SQLAlchemySyncRepository
from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

_RepositoryModelT = TypeVar("_RepositoryModelT")


class BaseRepository(SQLAlchemySyncRepository[_RepositoryModelT]):  # pyright: ignore[reportInvalidTypeArguments]
    """所有 Repository 的公共基类，提供批量 ID 查询等通用能力。

    注意：``reportInvalidTypeArguments`` 是 advanced_alchemy 的 TypeVar bound
    （``ModelProtocol``）与本项目自定义 TypeVar 之间的已知兼容性问题，
    运行时所有实际模型均满足 ``ModelProtocol`` 协议。
    """

    model_type: type[_RepositoryModelT]

    def __init__(self, session: Session) -> None:
        super().__init__(
            session=session,
            auto_expunge=False,
            auto_refresh=True,
            auto_commit=False,
            wrap_exceptions=False,
        )

    def get_by_ids(self, ids: list[int]) -> dict[int, _RepositoryModelT]:
        """根据 ID 列表批量获取实体，返回 ID 到实体的映射。"""
        normalized_ids = sorted(set(ids))
        if not normalized_ids:
            return {}

        statement = select(self.model_type).where(
            self.model_type.id.in_(normalized_ids)  # pyright: ignore[reportAttributeAccessIssue]
        )
        entities = list(self.session.scalars(statement).all())
        return {entity.id: entity for entity in entities}  # pyright: ignore[reportAttributeAccessIssue]
