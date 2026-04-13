"""Voyage embedding adapter."""

from __future__ import annotations

import httpx

from knowledge_chatbox_api.providers.base import (
    ClientCacheMixin,
    EmbeddingSettings,
    ProviderHealthResult,
    ProviderSettings,
    provider_retry,
)
from knowledge_chatbox_api.providers.ollama_url import normalize_provider_base_url

DEFAULT_VOYAGE_BASE_URL = "https://api.voyageai.com/v1"


class VoyageEmbeddingAdapter(ClientCacheMixin):
    """Voyage embedding 适配器。"""

    def __init__(self, client_factory: type | None = None) -> None:
        super().__init__()
        self.client_factory = client_factory or httpx.Client

    def _client(self, settings: ProviderSettings) -> httpx.Client:
        profile = settings.provider_profiles.voyage
        normalized_base_url = normalize_provider_base_url(
            profile.base_url,
            default=DEFAULT_VOYAGE_BASE_URL,
            ensure_v1_suffix=True,
        )
        base_url = normalized_base_url or DEFAULT_VOYAGE_BASE_URL
        api_key = profile.api_key or ""
        key = (base_url, api_key)

        def create_client():
            return self.client_factory(
                base_url=base_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                trust_env=False,
            )

        return self._get_or_create_client(key, create_client)

    @provider_retry
    def embed(self, texts: list[str], settings: EmbeddingSettings) -> list[list[float]]:
        response = self._client(settings).post(
            "/embeddings",
            json={"input": texts, "model": settings.embedding_route.model},
            timeout=float(settings.provider_timeout_seconds),
        )
        response.raise_for_status()
        payload = response.json()
        return [item["embedding"] for item in payload.get("data", [])]

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        return self._run_provider_health_check(lambda: self.embed(["ping"], settings))
