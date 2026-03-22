"""设置仓储数据访问实现。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.settings import AppSettings


class SettingsRepository:
    """封装系统设置数据访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self) -> AppSettings | None:
        """获取Get。"""
        return self.session.scalar(select(AppSettings).order_by(AppSettings.id))

    def save(self, settings: AppSettings) -> AppSettings:
        """保存Save。"""
        self.session.add(settings)
        self.session.flush()
        return settings
