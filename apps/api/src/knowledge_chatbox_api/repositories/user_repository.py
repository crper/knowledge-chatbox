"""用户仓储数据访问实现。"""

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.enums import UserRole


class UserRepository:
    """封装用户数据访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def count_admins(self) -> int:
        """处理CountAdmins相关逻辑。"""
        statement: Select[tuple[int]] = (
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN)
        )
        return self.session.scalar(statement) or 0

    def get_by_username(self, username: str) -> User | None:
        """获取ByUsername。"""
        return self.session.scalar(select(User).where(User.username == username))

    def get_by_id(self, user_id: int) -> User | None:
        """获取ById。"""
        return self.session.get(User, user_id)

    def list_users(self) -> list[User]:
        """列出用户。"""
        return list(self.session.scalars(select(User).order_by(User.id)).all())

    def add(self, user: User) -> User:
        """处理Add相关逻辑。"""
        self.session.add(user)
        self.session.flush()
        return user

    def delete(self, user: User) -> None:
        """删除Delete。"""
        self.session.delete(user)
