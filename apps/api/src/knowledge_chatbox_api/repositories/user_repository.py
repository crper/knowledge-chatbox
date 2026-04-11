from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.enums import UserRole
from knowledge_chatbox_api.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model_type = User

    def count_admins(self) -> int:
        return self.count(User.role == UserRole.ADMIN)

    def get_by_username(self, username: str) -> User | None:
        return self.get_one_or_none(username=username)

    def get_by_id(self, user_id: int) -> User | None:
        return self.get_one_or_none(id=user_id)

    def list_users(self) -> list[User]:
        return self.list(order_by=(User.id, True))

    def add_user(self, user: User) -> User:
        return self.add(user)

    def delete_user(self, user: User) -> None:
        self.session.delete(user)
