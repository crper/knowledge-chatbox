import { groupBy } from "es-toolkit";

import type { ChatSourceItem } from "../api/chat";

type ChatSourceGroup = {
  key: string;
  title: string;
  count: number;
  snippets: string[];
};

/**
 * 将来源按文档聚合，并保留每个文档前两个片段用于展示。
 */
export function groupChatSources(sources: ChatSourceItem[]): ChatSourceGroup[] {
  const grouped = groupBy(sources, (source) =>
    source.document_id !== undefined && source.document_id !== null
      ? `doc-${source.document_id}`
      : source.chunk_id,
  );

  return Object.entries(grouped).map(([key, items]) => {
    const first = items[0]!;
    return {
      key,
      title: first.document_name ?? first.section_title ?? first.chunk_id,
      count: items.length,
      snippets: items
        .map((s) => s.snippet)
        .filter((s): s is string => Boolean(s))
        .slice(0, 2),
    };
  });
}
