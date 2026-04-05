from __future__ import annotations

import time

from knowledge_chatbox_api.utils.embedding_cache import (
    CachedEmbeddingProvider,
    InMemoryEmbeddingCache,
)


class TestInMemoryEmbeddingCache:
    """InMemoryEmbeddingCache 单元测试。"""

    def test_get_returns_none_for_missing_key(self) -> None:
        """测试获取不存在的键返回 None。"""
        cache = InMemoryEmbeddingCache()
        result = cache.get("missing text")
        assert result is None

    def test_get_returns_none_for_empty_text(self) -> None:
        """测试空文本返回 None。"""
        cache = InMemoryEmbeddingCache()
        result = cache.get("")
        assert result is None

    def test_set_and_get_returns_embedding(self) -> None:
        """测试设置和获取 embedding。"""
        cache = InMemoryEmbeddingCache()
        embedding = [0.1, 0.2, 0.3]
        text = "test text"

        cache.set(text, embedding)
        result = cache.get(text)

        assert result == embedding

    def test_set_ignores_empty_text(self) -> None:
        """测试设置空文本被忽略。"""
        cache = InMemoryEmbeddingCache()
        embedding = [0.1, 0.2, 0.3]

        cache.set("", embedding)
        result = cache.get("")

        assert result is None

    def test_clear_removes_all_entries(self) -> None:
        """测试清空缓存。"""
        cache = InMemoryEmbeddingCache()
        cache.set("text1", [0.1])
        cache.set("text2", [0.2])

        cache.clear()

        assert cache.get("text1") is None
        assert cache.get("text2") is None

    def test_get_stats_returns_correct_info(self) -> None:
        """测试获取缓存统计信息。"""
        cache = InMemoryEmbeddingCache(maxsize=10)
        cache.set("text1", [0.1])
        cache.set("text2", [0.2])

        stats = cache.get_stats()

        assert stats["size"] == 2
        assert stats["maxsize"] == 10
        assert "ttl_seconds" in stats

    def test_evicts_lru_when_maxsize_reached(self) -> None:
        """测试达到最大容量时淘汰最久未使用的项。"""
        cache = InMemoryEmbeddingCache(maxsize=2)

        cache.set("text1", [0.1])
        time.sleep(0.01)  # 确保时间戳不同
        cache.set("text2", [0.2])
        time.sleep(0.01)
        cache.set("text3", [0.3])  # 应该淘汰 text1

        assert cache.get("text1") is None
        assert cache.get("text2") is not None
        assert cache.get("text3") is not None

    def test_updates_access_time_on_get(self) -> None:
        """测试获取时更新访问时间。"""
        cache = InMemoryEmbeddingCache(maxsize=2)

        cache.set("text1", [0.1])
        time.sleep(0.01)
        cache.set("text2", [0.2])
        time.sleep(0.01)

        # 访问 text1，使其成为最近使用
        cache.get("text1")
        time.sleep(0.01)

        # 添加新项，应该淘汰 text2（最久未使用）
        cache.set("text3", [0.3])

        assert cache.get("text1") is not None
        assert cache.get("text2") is None
        assert cache.get("text3") is not None

    def test_evicts_expired_entries(self) -> None:
        """测试淘汰过期项。"""
        cache = InMemoryEmbeddingCache(maxsize=10, ttl_seconds=0.1)

        cache.set("text1", [0.1])
        time.sleep(0.15)  # 等待过期

        # 获取时应该清理过期项
        result = cache.get("text1")

        assert result is None

    def test_same_text_returns_same_key(self) -> None:
        """测试相同文本生成相同的键。"""
        cache = InMemoryEmbeddingCache()
        text = "test text"
        embedding = [0.1, 0.2, 0.3]

        cache.set(text, embedding)
        result1 = cache.get(text)
        result2 = cache.get(text)

        assert result1 == embedding
        assert result2 == embedding


class TestCachedEmbeddingProvider:
    """CachedEmbeddingProvider 单元测试。"""

    def test_caches_embedding_results(self) -> None:
        """测试缓存 embedding 结果。"""
        call_count = 0

        class MockProvider:
            def embed(self, texts, settings):
                nonlocal call_count
                call_count += 1
                return [[0.1 * i] for i in range(len(texts))]

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(MockProvider(), cache)

        # 第一次调用
        result1 = provider.embed(["text1", "text2"], None)
        assert call_count == 1

        # 第二次调用相同文本，应该使用缓存
        result2 = provider.embed(["text1", "text2"], None)
        assert call_count == 1  # 没有增加

        assert result1 == result2

    def test_clear_cache_clears_underlying_cache(self) -> None:
        """测试清空缓存。"""
        call_count = 0

        class MockProvider:
            def embed(self, texts, settings):
                nonlocal call_count
                call_count += 1
                return [[0.1] for _ in texts]

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(MockProvider(), cache)

        provider.embed(["text1"], None)
        assert call_count == 1

        provider.clear_cache()

        # 清空后应该重新调用
        provider.embed(["text1"], None)
        assert call_count == 2

    def test_get_cache_stats_returns_stats(self) -> None:
        """测试获取缓存统计。"""

        class MockProvider:
            def embed(self, texts, settings):
                return [[0.1] for _ in texts]

        cache = InMemoryEmbeddingCache(maxsize=10)
        provider = CachedEmbeddingProvider(MockProvider(), cache)

        provider.embed(["text1", "text2"], None)

        stats = provider.get_cache_stats()

        assert stats["size"] == 2
        assert stats["maxsize"] == 10

    def test_health_check_delegates_to_underlying_provider(self) -> None:
        """测试健康检查委托给底层 provider。"""

        class MockProvider:
            def embed(self, texts, settings):
                return [[0.1] for _ in texts]

            def health_check(self, settings):
                return {"status": "ok"}

        cache = InMemoryEmbeddingCache()
        provider = CachedEmbeddingProvider(MockProvider(), cache)

        result = provider.health_check(None)

        assert result == {"status": "ok"}
