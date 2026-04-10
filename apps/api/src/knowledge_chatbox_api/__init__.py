"""后端包导出。"""

from knowledge_chatbox_api.core.config import get_settings

__all__ = ["__version__", "main"]
__version__ = "0.1.0"


def main() -> None:
    """启动 API 服务。"""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "knowledge_chatbox_api.main:app",
        host=settings.api_host,
        port=settings.api_port,
    )
