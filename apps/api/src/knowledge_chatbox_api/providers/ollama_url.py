"""Helpers for normalizing provider base URLs."""

from urllib.parse import urlsplit, urlunsplit

from knowledge_chatbox_api.utils.helpers import strip_or_none


def normalize_provider_base_url(
    base_url: str | None,
    *,
    default: str | None = None,
    ensure_v1_suffix: bool = True,
) -> str | None:
    normalized = (base_url or default or "").strip().rstrip("/")
    if not normalized:
        return None

    parsed = urlsplit(normalized)
    if not parsed.scheme or not parsed.netloc:
        candidate = f"https://{normalized}"
        reparsed = urlsplit(candidate)
        if reparsed.scheme and reparsed.netloc:
            normalized = candidate
            parsed = reparsed
        else:
            result = normalized.rstrip("/")
            if ensure_v1_suffix and not result.endswith("/v1"):
                result = f"{result}/v1"
            return result or None

    path = parsed.path.rstrip("/")
    if ensure_v1_suffix and not path.endswith("/v1"):
        path = f"{path}/v1"
    result = urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))
    return result or None


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
