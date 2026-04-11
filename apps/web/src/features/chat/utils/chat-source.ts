import type { ChatSourceItem } from "../api/chat";

/**
 * 类型守卫：检查值是否为 Record 类型对象。
 * @param value - 待检查的值
 * @returns 如果值为 Record 类型返回 true，否则返回 false
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 读取可选的数字类型字段。
 * @param value - 待读取的值
 * @returns 如果值为数字类型返回该值，否则返回 undefined
 */
function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/**
 * 读取可选的字符串类型字段。
 * @param value - 待读取的值
 * @returns 如果值为字符串类型返回该值，否则返回 undefined
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * 检查 Record 对象中指定字段是否具有无效的类型。
 * @param value - 待检查的 Record 对象
 * @param key - 字段名
 * @param expectedType - 期望的类型（"number" 或 "string"）
 * @returns 如果字段存在但类型不匹配返回 true，否则返回 false
 */
function hasInvalidOptionalField(
  value: Record<string, unknown>,
  key: string,
  expectedType: "number" | "string",
): boolean {
  return key in value && value[key] !== undefined && typeof value[key] !== expectedType;
}

/**
 * 解析并验证聊天来源项数据。
 * @param value - 待解析的未知值
 * @returns 如果解析成功返回 ChatSourceItem，否则返回 null
 *
 * @example
 * ```typescript
 * const source = parseChatSourceItem(apiResponse);
 * if (source) {
 *   // 使用解析后的来源数据
 *   console.log(source.chunk_id);
 * }
 * ```
 */
export function parseChatSourceItem(value: unknown): ChatSourceItem | null {
  if (!isRecord(value)) {
    return null;
  }

  // 验证必需字段 chunk_id
  const chunkId = readOptionalString(value.chunk_id);
  if (!chunkId) {
    return null;
  }

  // 验证 document_id 的类型
  const documentId = value.document_id;
  if (
    (documentId !== undefined && typeof documentId !== "number") ||
    hasInvalidOptionalField(value, "page_number", "number") ||
    hasInvalidOptionalField(value, "score", "number") ||
    hasInvalidOptionalField(value, "document_name", "string") ||
    hasInvalidOptionalField(value, "section_title", "string") ||
    hasInvalidOptionalField(value, "snippet", "string")
  ) {
    return null;
  }

  // 构建基础来源对象
  const source: ChatSourceItem = {
    chunk_id: chunkId,
  };

  // 读取并添加可选字段
  const documentName = readOptionalString(value.document_name);
  const pageNumber = readOptionalNumber(value.page_number);
  const score = readOptionalNumber(value.score);
  const sectionTitle = readOptionalString(value.section_title);
  const snippet = readOptionalString(value.snippet);

  if (typeof documentId === "number") {
    source.document_id = documentId;
  }
  if (documentName !== undefined) {
    source.document_name = documentName;
  }
  if (pageNumber !== undefined) {
    source.page_number = pageNumber;
  }
  if (score !== undefined) {
    source.score = score;
  }
  if (sectionTitle !== undefined) {
    source.section_title = sectionTitle;
  }
  if (snippet !== undefined) {
    source.snippet = snippet;
  }

  return source;
}
