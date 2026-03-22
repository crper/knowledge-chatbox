"""Embedding 缓存模块测试。"""

from __future__ import annotations

import time
from unittest.mock import MagicMock

from knowledge_chatbox_api.utils.embedding_cache import (
    CachedEmbeddingProvider,
    InMemoryEmbeddingCache,
)


class TestInMemoryEmbeddingCache:
    """测试 InMemoryEmbeddingCache 实现。"""

    def test_get_and_set(self):
        """测试基本的 get/set 操作。"""
        cache = InMemoryEmbeddingCache()
        embedding = [0.1, 0.2, 0.3]

        # 缓存未命中
        assert cache.get("test text") is None

        # 设置缓存
        cache.set("test text", embedding)

        # 缓存命中
        result = cache.get("test text")
        assert result == embedding

    def test_empty_text_not_cached(self):
        """测试空文本不会被缓存。"""
        cache = InMemoryEmbeddingCache()
        cache.set("", [0.1, 0.2])
        assert cache.get("") is None

    def test_ttl_expiration(self):
        """测试 TTL 过期。"""
        cache = InMemoryEmbeddingCache(ttl_seconds=0.1)
        cache.set("test", [0.1, 0.2])

        # 立即获取应该命中
        assert cache.get("test") == [0.1, 0.2]

        # 等待过期
        time.sleep(0.15)

        # 过期后应该返回 None
        assert cache.get("test") is None

    def test_lru_eviction(self):
        """测试 LRU 淘汰策略。"""
        cache = InMemoryEmbeddingCache(maxsize=3)

        cache.set("a", [0.1])
        cache.set("b", [0.2])
        cache.set("c", [0.3])

        # 访问 a，使其成为最近使用
        cache.get("a")

        # 添加新项，应该淘汰 b（最久未使用）
        cache.set("d", [0.4])

        assert cache.get("a") == [0.1]  # 应该还在
        assert cache.get("b") is None  # 应该被淘汰
        assert cache.get("c") == [0.3]  # 应该还在
        assert cache.get("d") == [0.4]  # 新项

    def test_clear(self):
        """测试清空缓存。"""
        cache = InMemoryEmbeddingCache()
        cache.set("a", [0.1])
        cache.set("b", [0.2])

        cache.clear()

        assert cache.get("a") is None
        assert cache.get("b") is None
        assert cache.get_stats()["size"] == 0

    def test_get_stats(self):
        """测试统计信息。"""
        cache = InMemoryEmbeddingCache(maxsize=100, ttl_seconds=3600)
        stats = cache.get_stats()

        assert stats["size"] == 0
        assert stats["maxsize"] == 100
        assert stats["ttl_seconds"] == 3600

        cache.set("test", [0.1, 0.2])
        stats = cache.get_stats()
        assert stats["size"] == 1


class TestCachedEmbeddingProvider:
    """测试 CachedEmbeddingProvider 包装器。"""

    def test_cache_hit(self):
        """测试缓存命中时不会调用底层 provider。"""
        mock_provider = MagicMock()
        mock_provider.embed.return_value = [[0.1, 0.2, 0.3]]

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        # 第一次调用
        result1 = provider.embed(["test query"], settings)
        assert result1 == [[0.1, 0.2, 0.3]]
        assert mock_provider.embed.call_count == 1

        # 第二次调用相同文本，应该命中缓存
        result2 = provider.embed(["test query"], settings)
        assert result2 == [[0.1, 0.2, 0.3]]
        # 底层 provider 不应该被再次调用
        assert mock_provider.embed.call_count == 1

    def test_partial_cache_hit(self):
        """测试部分缓存命中。"""
        mock_provider = MagicMock()
        mock_provider.embed.return_value = [[0.3, 0.4], [0.5, 0.6]]

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        # 先缓存一个文本
        cache.set("cached text", [0.1, 0.2])

        # 批量查询，包含已缓存和未缓存的
        result = provider.embed(["cached text", "new text 1", "new text 2"], settings)

        # 应该只调用一次底层 provider，传入两个未缓存的文本
        assert mock_provider.embed.call_count == 1
        call_args = mock_provider.embed.call_args
        assert call_args[0][0] == ["new text 1", "new text 2"]

        # 结果应该包含所有三个 embedding
        assert len(result) == 3
        assert result[0] == [0.1, 0.2]  # 来自缓存
        assert result[1] == [0.3, 0.4]  # 新计算
        assert result[2] == [0.5, 0.6]  # 新计算

    def test_empty_texts(self):
        """测试空文本列表。"""
        mock_provider = MagicMock()
        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        result = provider.embed([], settings)
        assert result == []
        mock_provider.embed.assert_not_called()

    def test_health_check_pass_through(self):
        """测试健康检查透传。"""
        mock_provider = MagicMock()
        mock_provider.health_check.return_value = {"healthy": True}

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        result = provider.health_check(settings)
        assert result == {"healthy": True}
        mock_provider.health_check.assert_called_once_with(settings)

    def test_clear_cache(self):
        """测试清空缓存。"""
        mock_provider = MagicMock()
        mock_provider.embed.return_value = [[0.1, 0.2]]

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        # 先调用一次缓存
        provider.embed(["test"], settings)
        assert cache.get_stats()["size"] == 1

        # 清空缓存
        provider.clear_cache()
        assert cache.get_stats()["size"] == 0

    def test_get_cache_stats(self):
        """测试获取缓存统计。"""
        mock_provider = MagicMock()
        cache = InMemoryEmbeddingCache(maxsize=500)
        provider = CachedEmbeddingProvider(mock_provider, cache)

        stats = provider.get_cache_stats()
        assert stats["size"] == 0
        assert stats["maxsize"] == 500


class TestEmbeddingCacheIntegration:
    """集成测试，模拟真实使用场景。"""

    def test_repeated_queries_use_cache(self):
        """测试重复查询使用缓存的场景。"""
        mock_provider = MagicMock()

        # 模拟 embedding 计算延迟
        def slow_embed(texts, settings):
            time.sleep(0.01)
            return [[float(i)] * 10 for i in range(len(texts))]

        mock_provider.embed.side_effect = slow_embed

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(mock_provider, cache)
        settings = MagicMock()

        # 第一次查询（冷缓存）
        start = time.perf_counter()
        result1 = provider.embed(["什么是人工智能"], settings)
        cold_time = time.perf_counter() - start

        # 第二次相同查询（热缓存）
        start = time.perf_counter()
        result2 = provider.embed(["什么是人工智能"], settings)
        hot_time = time.perf_counter() - start

        # 缓存命中应该快得多
        assert hot_time < cold_time / 10
        assert result1 == result2

        # 底层 provider 只被调用一次
        assert mock_provider.embed.call_count == 1
