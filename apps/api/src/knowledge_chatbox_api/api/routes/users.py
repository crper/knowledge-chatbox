"""用户路由定义。"""

from fastapi import APIRouter, status

from knowledge_chatbox_api.api.deps import CurrentUserDep, UserServiceDep
from knowledge_chatbox_api.api.error_responses import (
    ADMIN_ROUTE_ERROR_RESPONSES,
    USER_CREATE_ERROR_RESPONSES,
)
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.schemas.common import Envelope
from knowledge_chatbox_api.schemas.user import (
    CreateUserRequest,
    ResetPasswordRequest,
    UpdateUserRequest,
    UserRead,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def to_user_read(user: User) -> UserRead:
    """把用户模型转换为用户响应结构。"""
    return UserRead.model_validate(user, from_attributes=True)


@router.get(
    "",
    response_model=Envelope[list[UserRead]],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def list_users(
    user_service: UserServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[list[UserRead]]:
    """列出用户。"""
    users = user_service.list_users(current_user)
    return Envelope.ok([to_user_read(user) for user in users])


@router.post(
    "",
    response_model=Envelope[UserRead],
    status_code=status.HTTP_201_CREATED,
    responses=USER_CREATE_ERROR_RESPONSES,
)
def create_user(
    payload: CreateUserRequest,
    user_service: UserServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[UserRead]:
    """创建用户。"""
    user = user_service.create_user(current_user, payload.username, payload.password, payload.role)
    return Envelope.ok(to_user_read(user))


@router.patch(
    "/{user_id}",
    response_model=Envelope[UserRead],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    user_service: UserServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[UserRead]:
    """更新用户。"""
    user = user_service.update_user(
        current_user,
        user_id,
        status=payload.status,
        role=payload.role,
        theme_preference=payload.theme_preference,
    )
    return Envelope.ok(to_user_read(user))


@router.post(
    "/{user_id}/reset-password",
    response_model=Envelope[UserRead],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    user_service: UserServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[UserRead]:
    """重置密码。"""
    user = user_service.reset_password(current_user, user_id, payload.new_password)
    return Envelope.ok(to_user_read(user))


@router.delete(
    "/{user_id}",
    response_model=Envelope[dict[str, str]],
    responses=ADMIN_ROUTE_ERROR_RESPONSES,
)
def delete_user(
    user_id: int,
    user_service: UserServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[dict[str, str]]:
    """删除用户。"""
    user_service.delete_user(current_user, user_id)
    return Envelope.ok({"status": "deleted"})
