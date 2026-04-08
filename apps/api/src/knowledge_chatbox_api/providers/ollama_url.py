"""Helpers for normalizing Ollama base URLs."""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

from knowledge_chatbox_api.utils.compat import strip_or_none


def _trim_v1_suffix(path: str) -> str:
    normalized = path.rstrip("/")
    if normalized.endswith("/v1"):
        normalized = normalized[:-3]
    return normalized


def normalize_ollama_base_url(base_url: str | None) -> str | None:
    normalized = strip_or_none(base_url)
    if normalized is None:
        return None

    parsed = urlsplit(normalized)
    if not parsed.scheme or not parsed.netloc:
        return _trim_v1_suffix(normalized) or None

    normalized_path = _trim_v1_suffix(parsed.path)
    result = urlunsplit(
        (parsed.scheme, parsed.netloc, normalized_path, parsed.query, parsed.fragment)
    ).rstrip("/")
    return result or None


def build_ollama_openai_base_url(base_url: str | None) -> str | None:
    root_url = normalize_ollama_base_url(base_url)
    if root_url is None:
        return None

    parsed = urlsplit(root_url)
    if not parsed.scheme or not parsed.netloc:
        return f"{root_url.rstrip('/')}/v1"

    path = parsed.path.rstrip("/")
    openai_path = f"{path}/v1" if path else "/v1"
    return urlunsplit((parsed.scheme, parsed.netloc, openai_path, parsed.query, parsed.fragment))
