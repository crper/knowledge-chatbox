"""Helpers for normalizing provider base URLs."""

from yarl import URL

from knowledge_chatbox_api.utils.helpers import strip_or_none


def normalize_provider_base_url(
    base_url: str | None,
    *,
    default: str | None = None,
    ensure_v1_suffix: bool = True,
    preserve_existing_path: bool = False,
) -> str | None:
    normalized = strip_or_none(base_url) or strip_or_none(default)
    if normalized is None:
        return None
    normalized = normalized.rstrip("/")

    parsed = URL(normalized)
    if not parsed.scheme or not parsed.host:
        candidate = f"https://{normalized}"
        reparsed = URL(candidate)
        if reparsed.scheme and reparsed.host:
            normalized = candidate
            parsed = reparsed
        else:
            result = normalized.rstrip("/")
            if ensure_v1_suffix and not result.endswith("/v1"):
                result = f"{result}/v1"
            return result or None

    path = parsed.path.rstrip("/")
    if ensure_v1_suffix:
        if not path:
            path = "/v1"
        elif not path.endswith("/v1") and not preserve_existing_path:
            path = f"{path}/v1"
    result = parsed.with_path(path).with_query(None).with_fragment(None)
    return str(result) or None


def _trim_v1_suffix(path: str) -> str:
    return path.rstrip("/").removesuffix("/v1")


def normalize_ollama_base_url(base_url: str | None) -> str | None:
    normalized = strip_or_none(base_url)
    if normalized is None:
        return None

    parsed = URL(normalized)
    if not parsed.scheme or not parsed.host:
        return _trim_v1_suffix(normalized) or None

    normalized_path = _trim_v1_suffix(parsed.path)
    result = parsed.with_path(normalized_path).with_query(None).with_fragment(None)
    return str(result).rstrip("/") or None


def build_ollama_openai_base_url(base_url: str | None) -> str | None:
    root_url = normalize_ollama_base_url(base_url)
    if root_url is None:
        return None

    parsed = URL(root_url)
    if not parsed.scheme or not parsed.host:
        return f"{root_url.rstrip('/')}/v1"

    path = parsed.path.rstrip("/")
    openai_path = f"{path}/v1" if path else "/v1"
    return str(parsed.with_path(openai_path).with_query(None).with_fragment(None))
