"""Text matching utilities for retrieval and search."""

import re
import unicodedata
from itertools import pairwise


def _is_cjk_character(char: str) -> bool:
    codepoint = ord(char)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
        or 0x20000 <= codepoint <= 0x2A6DF
        or 0x2A700 <= codepoint <= 0x2B73F
        or 0x2B740 <= codepoint <= 0x2B81F
        or 0x2B820 <= codepoint <= 0x2CEAF
        or unicodedata.category(char) == "Lo"
    )


_QUOTED_PHRASE_PATTERN = re.compile(r'[\\"""「『](.+?)[\\"""」』]')


def normalize_match_text(text: str) -> str:
    normalized, _ = normalize_and_tokenize(text)
    return normalized


def quoted_phrases(text: str) -> set[str]:
    phrases = {
        normalize_match_text(match.strip()) for match in _QUOTED_PHRASE_PATTERN.findall(text)
    }
    return {phrase for phrase in phrases if len(phrase) >= 2}


def raw_quoted_phrases(text: str) -> list[str]:
    return [
        match.strip() for match in _QUOTED_PHRASE_PATTERN.findall(text) if len(match.strip()) >= 2
    ]


def _extract_cjk_tokens(cjk_chars: list[str]) -> set[str]:
    if len(cjk_chars) == 1:
        return {cjk_chars[0]}
    return {a + b for a, b in pairwise(cjk_chars)}


def tokenize_text(text: str) -> set[str]:
    _, tokens = normalize_and_tokenize(text)
    return tokens


def normalize_and_tokenize(text: str) -> tuple[str, set[str]]:
    """单次遍历同时完成标准化和分词，避免对同一文本做两次逐字符扫描。"""
    normalized_chars: list[str] = []
    tokens: set[str] = set()
    ascii_buffer: list[str] = []
    cjk_run: list[str] = []

    for char in text:
        if char.isascii() and char.isalnum():
            if cjk_run:
                tokens.update(_extract_cjk_tokens(cjk_run))
                cjk_run.clear()
            ascii_buffer.append(char.lower())
            normalized_chars.append(char.lower())
        elif _is_cjk_character(char):
            if ascii_buffer:
                tokens.add("".join(ascii_buffer))
                ascii_buffer.clear()
            cjk_run.append(char)
            normalized_chars.append(char)
        else:
            if ascii_buffer:
                tokens.add("".join(ascii_buffer))
                ascii_buffer.clear()
            if cjk_run:
                tokens.update(_extract_cjk_tokens(cjk_run))
                cjk_run.clear()

    if ascii_buffer:
        tokens.add("".join(ascii_buffer))
    if cjk_run:
        tokens.update(_extract_cjk_tokens(cjk_run))

    return "".join(normalized_chars), tokens


def has_text_overlap(
    query_text: str,
    haystack: str,
    *,
    query_normalized: str | None = None,
    query_tokens: set[str] | None = None,
    query_quoted_phrases: set[str] | None = None,
) -> bool:
    if query_tokens is None or query_normalized is None or query_quoted_phrases is None:
        query_normalized, query_tokens = normalize_and_tokenize(query_text)
        query_quoted_phrases = quoted_phrases(query_text)

    if not query_tokens:
        return False

    normalized_haystack, haystack_tokens = normalize_and_tokenize(haystack)

    for phrase in query_quoted_phrases:
        if phrase in normalized_haystack:
            return True

    if len(query_normalized) >= 2 and query_normalized in normalized_haystack:
        return True

    return len(query_tokens & haystack_tokens) > 0
