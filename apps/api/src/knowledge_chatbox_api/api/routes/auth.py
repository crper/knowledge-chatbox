"""认证路由定义。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from knowledge_chatbox_api.api.deps import (
    AuthServiceDep,
    CurrentUserDep,
    get_session_token,
)
from knowledge_chatbox_api.schemas.auth import (
    AccessTokenRead,
    AuthUserRead,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    SessionBootstrapRead,
    UpdatePreferencesRequest,
)
from knowledge_chatbox_api.schemas.common import Envelope

router = APIRouter(prefix="/api/auth", tags=["auth"])

SessionTokenDep = Annotated[str | None, Depends(get_session_token)]


def set_session_cookie(
    *,
    auth_service,
    refresh_token: str,
    request: Request,
    response: Response,
) -> None:
    """写入刷新会话 cookie。"""
    response.set_cookie(
        key=auth_service.settings.session_cookie_name,
        value=refresh_token,
        httponly=True,
        path="/",
        samesite="lax",
        secure=auth_service.settings.should_use_secure_session_cookie(request.url.scheme),
        max_age=auth_service.settings.session_ttl_hours * 3600,
    )


@router.post("/login", response_model=Envelope[LoginResponse])
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    auth_service: AuthServiceDep,
) -> Envelope[LoginResponse]:
    """执行登录并创建认证会话。"""
    refresh_token, access_token, user = auth_service.login(payload.username, payload.password)
    set_session_cookie(
        auth_service=auth_service,
        refresh_token=refresh_token,
        request=request,
        response=response,
    )
    return Envelope.ok(
        LoginResponse(
            access_token=access_token,
            expires_in=auth_service.settings.access_token_ttl_minutes * 60,
            user=AuthUserRead.model_validate(user),
        )
    )


@router.post("/refresh", response_model=Envelope[AccessTokenRead])
def refresh(
    request: Request,
    response: Response,
    token: SessionTokenDep,
    auth_service: AuthServiceDep,
) -> Envelope[AccessTokenRead]:
    """轮换刷新会话并返回新的访问令牌。"""
    refresh_token, access_token = auth_service.refresh_access_token(token)
    set_session_cookie(
        auth_service=auth_service,
        refresh_token=refresh_token,
        request=request,
        response=response,
    )
    return Envelope.ok(
        AccessTokenRead(
            access_token=access_token,
            expires_in=auth_service.settings.access_token_ttl_minutes * 60,
        )
    )


@router.post("/bootstrap", response_model=Envelope[SessionBootstrapRead])
def bootstrap(
    _request: Request,
    response: Response,
    token: SessionTokenDep,
    auth_service: AuthServiceDep,
) -> Envelope[SessionBootstrapRead]:
    """启动期恢复刷新会话；匿名态返回 200 且 authenticated=false。"""
    restored = auth_service.bootstrap_session(token)

    if restored is None:
        response.delete_cookie(auth_service.settings.session_cookie_name, path="/")
        return Envelope.ok(SessionBootstrapRead(authenticated=False))

    access_token, user = restored
    return Envelope.ok(
        SessionBootstrapRead(
            authenticated=True,
            access_token=access_token,
            expires_in=auth_service.settings.access_token_ttl_minutes * 60,
            user=AuthUserRead.model_validate(user),
        )
    )


@router.post("/logout", response_model=Envelope[dict[str, str]])
def logout(
    response: Response,
    token: SessionTokenDep,
    auth_service: AuthServiceDep,
) -> Envelope[dict[str, str]]:
    """注销当前认证会话。"""
    auth_service.logout(token)
    response.delete_cookie(auth_service.settings.session_cookie_name, path="/")
    return Envelope.ok({"status": "ok"})


@router.get("/me", response_model=Envelope[AuthUserRead])
def me(current_user: CurrentUserDep) -> Envelope[AuthUserRead]:
    """返回当前登录用户信息。"""
    return Envelope.ok(AuthUserRead.model_validate(current_user))


@router.post("/change-password", response_model=Envelope[AuthUserRead])
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    request: Request,
    auth_service: AuthServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[AuthUserRead]:
    """修改密码。"""
    user = auth_service.change_password(
        current_user,
        payload.current_password,
        payload.new_password,
    )
    response.delete_cookie(auth_service.settings.session_cookie_name, path="/")
    request.scope["auth_user"] = user
    return Envelope.ok(AuthUserRead.model_validate(user))


@router.patch("/preferences", response_model=Envelope[AuthUserRead])
def update_preferences(
    payload: UpdatePreferencesRequest,
    auth_service: AuthServiceDep,
    current_user: CurrentUserDep,
) -> Envelope[AuthUserRead]:
    """更新偏好。"""
    user = auth_service.update_preferences(current_user, payload.theme_preference)
    return Envelope.ok(AuthUserRead.model_validate(user))
