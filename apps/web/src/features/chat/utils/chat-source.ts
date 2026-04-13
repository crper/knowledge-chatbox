import type { ChatSourceItem } from "../api/chat";
import { isPlainObject } from "es-toolkit";

/**
 * 解析并验证聊天来源项数据。
 * @param value - 待解析的未知值
 * @returns 如果解析成功返回 ChatSourceItem，否则返回 null
 */
export function parseChatSourceItem(value: unknown): ChatSourceItem | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const chunkId = typeof value.chunk_id === "string" ? value.chunk_id : undefined;
  if (!chunkId) {
    return null;
  }

  const documentId = value.document_id;
  if (
    (documentId !== undefined && typeof documentId !== "number") ||
    ("page_number" in value &&
      value.page_number !== undefined &&
      typeof value.page_number !== "number") ||
    ("score" in value && value.score !== undefined && typeof value.score !== "number") ||
    ("document_name" in value &&
      value.document_name !== undefined &&
      typeof value.document_name !== "string") ||
    ("section_title" in value &&
      value.section_title !== undefined &&
      typeof value.section_title !== "string") ||
    ("snippet" in value && value.snippet !== undefined && typeof value.snippet !== "string")
  ) {
    return null;
  }

  const source: ChatSourceItem = {
    chunk_id: chunkId,
  };

  if (typeof documentId === "number") {
    source.document_id = documentId;
  }
  if (typeof value.document_name === "string") {
    source.document_name = value.document_name;
  }
  if (typeof value.page_number === "number") {
    source.page_number = value.page_number;
  }
  if (typeof value.score === "number") {
    source.score = value.score;
  }
  if (typeof value.section_title === "string") {
    source.section_title = value.section_title;
  }
  if (typeof value.snippet === "string") {
    source.snippet = value.snippet;
  }

  return source;
}
