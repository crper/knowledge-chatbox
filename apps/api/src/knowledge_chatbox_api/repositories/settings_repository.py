from cachetools import TTLCache
from sqlalchemy import func, select

from knowledge_chatbox_api.models.settings import AppSettings, SettingsVersion
from knowledge_chatbox_api.repositories.base import BaseRepository

_SETTINGS_CACHE_TTL = 5.0
_settings_id_cache: TTLCache[str, int] = TTLCache(maxsize=1, ttl=_SETTINGS_CACHE_TTL)


class SettingsRepository(BaseRepository[AppSettings]):
    model_type = AppSettings

    def get_cached_id(self) -> int | None:
        return _settings_id_cache.get("id")

    def set_cached_id(self, record_id: int) -> None:
        _settings_id_cache["id"] = record_id

    def invalidate_id_cache(self) -> None:
        _settings_id_cache.clear()

    def get_settings(self) -> AppSettings | None:
        return self.session.scalar(select(AppSettings).order_by(AppSettings.id))

    def save(self, settings: AppSettings) -> AppSettings:
        return self.add(settings)


class SettingsVersionRepository(BaseRepository[SettingsVersion]):
    model_type = SettingsVersion

    def next_version_no(self, settings_id: int) -> int:
        latest_version = self.session.scalar(
            select(func.max(SettingsVersion.version_no)).where(
                SettingsVersion.settings_id == settings_id
            )
        )
        return int(latest_version or 0) + 1

    def save(self, version: SettingsVersion) -> SettingsVersion:
        return self.add(version)
