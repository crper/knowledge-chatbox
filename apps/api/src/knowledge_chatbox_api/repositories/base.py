from __future__ import annotations

from typing import TYPE_CHECKING, Any, TypeVar

from advanced_alchemy.repository import SQLAlchemySyncRepository
from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

_RepositoryModelT = TypeVar("_RepositoryModelT")


class BaseRepository(SQLAlchemySyncRepository[_RepositoryModelT]):  # type: ignore[type-arg]
    model_type: type[_RepositoryModelT]

    def __init__(self, session: Session) -> None:
        super().__init__(
            session=session,
            auto_expunge=False,
            auto_refresh=True,
            auto_commit=False,
            wrap_exceptions=False,
        )

    def commit_and_refresh(self, entity: object) -> None:
        self.session.commit()
        self.session.refresh(entity)

    def get_by_ids(self, ids: list[int]) -> dict[int, Any]:
        """根据 ID 列表批量获取实体，返回 ID 到实体的映射。"""
        normalized_ids = sorted(set(ids))
        if not normalized_ids:
            return {}

        statement = select(self.model_type).where(self.model_type.id.in_(normalized_ids))  # type: ignore[attr-defined]
        entities = list(self.session.scalars(statement).all())
        return {entity.id: entity for entity in entities}  # type: ignore[attr-defined]
