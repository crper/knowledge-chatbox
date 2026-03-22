"""OpenAPI metadata shared by the FastAPI application."""

from __future__ import annotations

API_SUMMARY = "本地优先的知识工作台 API"
API_DESCRIPTION = (
    "Knowledge Chatbox API 提供本地优先的认证、文档入库、检索问答、系统设置和用户管理能力。"
    "当前接口文档与前端类型生成统一以 FastAPI OpenAPI 为真相源。"
)

OPENAPI_TAGS = [
    {
        "name": "auth",
        "description": "登录、登出、当前用户、密码修改与个人偏好。",
    },
    {
        "name": "chat",
        "description": "会话、消息、同步问答与流式 SSE 问答。",
    },
    {
        "name": "documents",
        "description": "文档上传、修订历史、文件下载与索引重建。",
    },
    {
        "name": "health",
        "description": "基础健康检查与 capability 可用性探测。",
    },
    {
        "name": "settings",
        "description": "系统级 provider 配置、route 切换与连接测试。",
    },
    {
        "name": "users",
        "description": "管理员用户管理与密码重置。",
    },
]
