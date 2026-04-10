"""Voyage embedding adapter."""

from time import perf_counter

import httpx

from knowledge_chatbox_api.providers.base import (
    BaseEmbeddingAdapter,
    ClientCacheMixin,
    EmbeddingSettings,
    ProviderHealthResult,
    ProviderSettings,
    provider_retry,
)
from knowledge_chatbox_api.utils.timing import elapsed_ms

DEFAULT_VOYAGE_BASE_URL = "https://api.voyageai.com/v1"


class VoyageEmbeddingAdapter(ClientCacheMixin, BaseEmbeddingAdapter):
    """Voyage embedding 适配器。"""

    def __init__(self, client_factory=None) -> None:
        super().__init__()
        self.client_factory = client_factory or httpx.Client

    def _request_timeout(self, settings: ProviderSettings) -> float:
        return float(settings.provider_timeout_seconds)

    def _client(self, settings: ProviderSettings):
        profile = settings.provider_profiles.voyage
        base_url = (profile.base_url or DEFAULT_VOYAGE_BASE_URL).strip().rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"
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
            timeout=self._request_timeout(settings),
        )
        response.raise_for_status()
        payload = response.json()
        return [item["embedding"] for item in payload.get("data", [])]

    def health_check(self, settings: EmbeddingSettings) -> ProviderHealthResult:
        start = perf_counter()
        try:
            self.embed(["ping"], settings)
        except Exception as exc:  # noqa: BLE001
            return ProviderHealthResult(healthy=False, message=str(exc))
        return ProviderHealthResult(
            healthy=True,
            message="ok",
            latency_ms=elapsed_ms(start),
        )
