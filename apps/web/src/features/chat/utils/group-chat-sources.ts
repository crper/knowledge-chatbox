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
  const groups = new Map<string, ChatSourceGroup>();

  for (const source of sources) {
    const key =
      source.document_id !== undefined && source.document_id !== null
        ? `doc-${source.document_id}`
        : source.chunk_id;
    const title = source.document_name ?? source.section_title ?? source.chunk_id;
    const current = groups.get(key) ?? { key, title, count: 0, snippets: [] };

    current.count += 1;
    if (source.snippet && current.snippets.length < 2) {
      current.snippets.push(source.snippet);
    }

    groups.set(key, current);
  }

  return Array.from(groups.values());
}
