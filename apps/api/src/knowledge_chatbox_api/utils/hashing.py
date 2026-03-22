"""Hashing工具模块。"""

from __future__ import annotations

import hashlib


def sha256_bytes(content: bytes) -> str:
    """计算字节内容的 SHA-256 哈希值。"""
    return hashlib.sha256(content).hexdigest()
