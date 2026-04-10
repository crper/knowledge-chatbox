"""空间仓储数据访问实现。"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.enums import SpaceKind
from knowledge_chatbox_api.models.space import Space

PERSONAL_SPACE_SLUG_PREFIX = "personal-space"


class SpaceRepository:
    """封装 personal space 相关数据库访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def personal_space_slug(self, user_id: int) -> str:
        return f"{PERSONAL_SPACE_SLUG_PREFIX}-{user_id}"

    def get_personal_space(self, user_id: int) -> Space | None:
        return self.session.scalar(
            select(Space).where(Space.slug == self.personal_space_slug(user_id))
        )

    def ensure_personal_space(
        self,
        *,
        user_id: int,
    ) -> Space:
        space = self.get_personal_space(user_id)
        if space is not None:
            return space

        space = Space(
            owner_user_id=user_id,
            slug=self.personal_space_slug(user_id),
            name=f"User {user_id} Space",
            kind=SpaceKind.PERSONAL,
        )
        self.session.add(space)
        self.session.flush()
        return space

    def get_visible_space_ids_for_user(self, user_id: int) -> set[int]:
        return {self.ensure_personal_space(user_id=user_id).id}
