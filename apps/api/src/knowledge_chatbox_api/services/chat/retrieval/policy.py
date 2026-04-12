from typing import Any

from knowledge_chatbox_api.models.enums import ChatAttachmentType
from knowledge_chatbox_api.services.chat.retrieval.models import ATTACHMENT_SCOPED_QUERY_MULTIPLIER
from knowledge_chatbox_api.utils.text_matching import normalize_match_text

SMALL_TALK_QUERIES = frozenset(
    {
        "hello",
        "hey",
        "hi",
        "ok",
        "okay",
        "你好",
        "你好啊",
        "你好呀",
        "再见",
        "有人吗",
        "哈喽",
        "嗨",
        "在吗",
        "在不在",
        "晚上好",
        "晚安",
        "早上好",
        "早安",
        "下午好",
        "收到",
        "拜拜",
        "谢谢",
        "谢谢你",
        "多谢",
        "好的",
        "您好",
    }
)

GENERIC_IMAGE_ONLY_QUERIES = frozenset(
    {
        "帮我看看这张图",
        "帮我看看这幅图",
        "看看这张图",
        "看看这幅图",
        "描述这张图",
        "描述这幅图",
        "分析这张图",
        "分析这幅图",
        "这张图说了什么",
        "这幅图说了什么",
        "describethisimage",
        "analyzethisimage",
        "lookatthisimage",
        "whatdoesthisimagesay",
    }
)


def collect_attachment_revision_ids(attachments: list[dict[str, Any]] | None) -> set[int]:
    if not attachments:
        return set()

    return {
        revision_id
        for attachment in attachments
        if isinstance(revision_id := attachment.get("document_revision_id"), int)
    }


def has_only_image_attachments(attachments: list[dict[str, Any]] | None) -> bool:
    if not attachments:
        return False
    return all(attachment.get("type") == ChatAttachmentType.IMAGE for attachment in attachments)


def is_image_only_analysis_turn(
    query_text: str,
    attachments: list[dict[str, Any]] | None,
) -> bool:
    if not has_only_image_attachments(attachments):
        return False

    normalized_query = normalize_match_text(query_text)
    if not normalized_query:
        return True

    return normalized_query in GENERIC_IMAGE_ONLY_QUERIES


def should_retrieve_knowledge(
    query_text: str,
    *,
    attachments: list[dict[str, Any]] | None = None,
) -> bool:
    if is_image_only_analysis_turn(query_text, attachments):
        return False

    normalized_query = normalize_match_text(query_text)
    if not normalized_query:
        return False
    return normalized_query not in SMALL_TALK_QUERIES


def build_retrieval_where_filter(
    active_space_id: int | None,
    attachments: list[dict[str, Any]] | None,
    *,
    attachment_revision_ids: list[int] | None = None,
) -> dict[str, Any] | None:
    conditions: list[dict[str, Any]] = []
    if active_space_id is not None:
        conditions.append({"space_id": active_space_id})

    if attachment_revision_ids is None:
        attachment_revision_ids = sorted(collect_attachment_revision_ids(attachments))
    if attachment_revision_ids:
        conditions.append({"document_revision_id": {"$in": attachment_revision_ids}})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def attachment_scoped_top_k(attachment_revision_ids: list[int]) -> int:
    return max(len(attachment_revision_ids) * ATTACHMENT_SCOPED_QUERY_MULTIPLIER, 3)


def select_attachment_scoped_records(
    records: list[dict[str, Any]],
    attachment_revision_ids: list[int],
) -> list[dict[str, Any]]:
    if len(attachment_revision_ids) <= 1:
        return records

    max_selected = len(attachment_revision_ids)
    records_by_revision: dict[int, list[dict[str, Any]]] = {
        revision_id: [] for revision_id in attachment_revision_ids
    }
    for record in records:
        revision_id = record.get("document_revision_id")
        if isinstance(revision_id, int) and revision_id in records_by_revision:
            records_by_revision[revision_id].append(record)

    selected: list[dict[str, Any]] = []
    seen_chunk_ids: set[str] = set()
    revision_iterators: dict[int, int] = dict.fromkeys(attachment_revision_ids, 0)

    while True:
        round_added = False
        for revision_id in attachment_revision_ids:
            revision_records = records_by_revision[revision_id]
            idx = revision_iterators[revision_id]
            while idx < len(revision_records):
                record = revision_records[idx]
                revision_iterators[revision_id] = idx + 1
                chunk_id = str(record.get("id", ""))
                if chunk_id in seen_chunk_ids:
                    idx += 1
                    continue
                seen_chunk_ids.add(chunk_id)
                selected.append(record)
                round_added = True
                if len(selected) >= max_selected:
                    return selected
                break
        if not round_added:
            break
    return selected
