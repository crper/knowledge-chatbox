"""Text matching utilities for retrieval and search."""

import re
from itertools import pairwise


def _is_cjk_character(char: str) -> bool:
    codepoint = ord(char)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )


def normalize_match_text(text: str) -> str:
    return "".join(
        char.lower()
        for char in text
        if (char.isascii() and char.isalnum()) or _is_cjk_character(char)
    )


def quoted_phrases(text: str) -> set[str]:
    pattern = r'[\\"""「『](.+?)[\\"""」』]'
    phrases = {normalize_match_text(match.strip()) for match in re.findall(pattern, text)}
    return {phrase for phrase in phrases if len(phrase) >= 2}


def raw_quoted_phrases(text: str) -> list[str]:
    pattern = r'[\\"""「『](.+?)[\\"""」』]'
    return [match.strip() for match in re.findall(pattern, text) if len(match.strip()) >= 2]


def _extract_cjk_tokens(cjk_chars: list[str]) -> set[str]:
    if len(cjk_chars) == 1:
        return {cjk_chars[0]}
    return {a + b for a, b in pairwise(cjk_chars)}


def tokenize_text(text: str) -> set[str]:
    tokens: set[str] = set()
    ascii_buffer: list[str] = []
    cjk_run: list[str] = []

    for char in text:
        if char.isascii() and char.isalnum():
            if cjk_run:
                tokens.update(_extract_cjk_tokens(cjk_run))
                cjk_run.clear()
            ascii_buffer.append(char.lower())
        elif _is_cjk_character(char):
            if ascii_buffer:
                tokens.add("".join(ascii_buffer))
                ascii_buffer.clear()
            cjk_run.append(char)
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
        query_tokens = tokenize_text(query_text)
        query_normalized = normalize_match_text(query_text)
        query_quoted_phrases = quoted_phrases(query_text)

    if not query_tokens:
        return False

    normalized_haystack = normalize_match_text(haystack)

    for phrase in query_quoted_phrases:
        if phrase in normalized_haystack:
            return True

    if len(query_normalized) >= 2 and query_normalized in normalized_haystack:
        return True

    haystack_tokens = tokenize_text(haystack)
    return len(query_tokens & haystack_tokens) > 0
