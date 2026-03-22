/**
 * @file 聊天相关工具模块。
 */

import type { ChatMessageItem } from "../api/chat";

/**
 * 收集来源。
 */
export function collectSources(messages: ChatMessageItem[]) {
  return Array.from(
    new Map(
      messages
        .flatMap((message) => message.sources_json ?? [])
        .map((source) => [source.chunk_id, source]),
    ).values(),
  );
}
