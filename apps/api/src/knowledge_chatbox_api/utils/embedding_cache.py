"""Embedding 缓存工具，避免重复计算相同的查询 embedding。"""

from __future__ import annotations

import hashlib
import time
from typing import Any, Protocol


class EmbeddingCache(Protocol):
    """Embedding 缓存协议。"""

    def get(self, text: str) -> list[float] | None:
        """获取缓存的 embedding，不存在返回 None。"""
        ...

    def set(self, text: str, embedding: list[float]) -> None:
        """设置 embedding 缓存。"""
        ...

    def clear(self) -> None:
        """清空缓存。"""
        ...

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计。"""
        ...


class InMemoryEmbeddingCache:
    """
    内存中的 Embedding 缓存实现。

    使用 LRU 策略，支持 TTL（生存时间）限制，避免内存无限增长。
    """

    def __init__(
        self,
        *,
        maxsize: int = 1000,
        ttl_seconds: float = 3600,
    ) -> None:
        self._maxsize = maxsize
        self._ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[list[float], float]] = {}
        self._access_order: dict[str, float] = {}

    def _make_key(self, text: str) -> str:
        """生成缓存键（使用文本的 hash）。"""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _evict_expired(self) -> None:
        """清理过期的缓存项。"""
        now = time.monotonic()
        expired_keys = [
            key
            for key, (_, timestamp) in self._cache.items()
            if now - timestamp > self._ttl_seconds
        ]
        for key in expired_keys:
            del self._cache[key]
            if key in self._access_order:
                del self._access_order[key]

    def _evict_lru(self) -> None:
        """按 LRU 策略清理最久未使用的项，直到缓存大小符合限制。"""
        while len(self._cache) >= self._maxsize:
            if not self._access_order:
                break
            oldest_key = min(self._access_order, key=lambda k: self._access_order[k])
            del self._cache[oldest_key]
            del self._access_order[oldest_key]

    def get(self, text: str) -> list[float] | None:
        """获取缓存的 embedding。"""
        if not text:
            return None

        self._evict_expired()

        key = self._make_key(text)
        cached = self._cache.get(key)
        if cached is None:
            return None

        embedding, timestamp = cached
        if time.monotonic() - timestamp > self._ttl_seconds:
            del self._cache[key]
            if key in self._access_order:
                del self._access_order[key]
            return None

        # 更新访问时间
        self._access_order[key] = time.monotonic()
        return embedding

    def set(self, text: str, embedding: list[float]) -> None:
        """设置 embedding 缓存。"""
        if not text:
            return

        self._evict_expired()

        if len(self._cache) >= self._maxsize:
            self._evict_lru()

        key = self._make_key(text)
        now = time.monotonic()
        self._cache[key] = (embedding, now)
        self._access_order[key] = now

    def clear(self) -> None:
        """清空所有缓存。"""
        self._cache.clear()
        self._access_order.clear()

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计信息（用于监控）。"""
        return {
            "size": len(self._cache),
            "maxsize": self._maxsize,
            "ttl_seconds": self._ttl_seconds,
        }


class CachedEmbeddingProvider:
    """
    包装 embedding provider，添加缓存层。

    使用示例：
        raw_provider = OpenAIEmbeddingAdapter()
        cache = InMemoryEmbeddingCache(maxsize=500, ttl_seconds=1800)
        cached_provider = CachedEmbeddingProvider(raw_provider, cache)

        # 第一次调用会计算 embedding
        embedding1 = cached_provider.embed(["query text"], settings)

        # 相同文本的第二次调用会命中缓存
        embedding2 = cached_provider.embed(["query text"], settings)
    """

    def __init__(
        self,
        provider: Any,
        cache: EmbeddingCache | None = None,
    ) -> None:
        self._provider = provider
        self._cache = cache or InMemoryEmbeddingCache()

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        """
        批量获取 embedding，优先使用缓存。

        对于缓存命中的文本直接返回缓存结果，
        未命中的文本调用底层 provider 计算并缓存结果。
        """
        if not texts:
            return []

        results: list[list[float] | None] = [None] * len(texts)
        missing_indices: list[int] = []
        missing_texts: list[str] = []

        # 检查缓存
        for i, text in enumerate(texts):
            cached = self._cache.get(text)
            if cached is not None:
                results[i] = cached
            else:
                missing_indices.append(i)
                missing_texts.append(text)

        # 批量计算缺失的 embedding
        if missing_texts:
            computed_embeddings = self._provider.embed(missing_texts, settings)
            for idx, text_idx in enumerate(missing_indices):
                embedding = computed_embeddings[idx]
                results[text_idx] = embedding
                # 存入缓存
                self._cache.set(texts[text_idx], embedding)

        return [r for r in results if r is not None]

    def health_check(self, settings) -> Any:
        """透传到底层 provider 的健康检查。"""
        return self._provider.health_check(settings)

    def clear_cache(self) -> None:
        """清空缓存。"""
        self._cache.clear()

    def get_cache_stats(self) -> dict[str, Any]:
        """获取缓存统计。"""
        if hasattr(self._cache, "get_stats"):
            return self._cache.get_stats()
        return {"size": "unknown"}
