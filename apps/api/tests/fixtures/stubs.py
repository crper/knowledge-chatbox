from __future__ import annotations

from typing import Any


class ResponseAdapterStub:
    """统一的响应适配器 Stub"""

    def __init__(self) -> None:
        self.response_calls: list[list[dict[str, Any]]] = []

    def response(self, messages: list[dict[str, Any]], settings) -> str:
        del settings
        self.response_calls.append(messages)
        return "同步回答"


class EmbeddingAdapterStub:
    """统一的嵌入适配器 Stub"""

    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del settings
        self.embed_calls.append(texts)
        return [[0.1] * 8]


class FailingEmbeddingAdapterStub:
    """模拟失败的嵌入适配器"""

    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        self.embed_calls.append(texts)
        del settings
        raise RuntimeError("embedding backend unavailable")
