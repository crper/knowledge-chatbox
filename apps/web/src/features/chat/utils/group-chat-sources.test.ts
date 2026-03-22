import { groupChatSources } from "./group-chat-sources";

describe("groupChatSources", () => {
  it("groups sources by document and keeps only the first two snippets per document", () => {
    const groups = groupChatSources([
      { chunk_id: "10:0", document_id: 10, document_name: "会话图片附件 1", snippet: "片段 A" },
      { chunk_id: "10:1", document_id: 10, document_name: "会话图片附件 1", snippet: "片段 B" },
      { chunk_id: "10:2", document_id: 10, document_name: "会话图片附件 1", snippet: "片段 C" },
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        key: "doc-10",
        title: "会话图片附件 1",
        count: 3,
        snippets: ["片段 A", "片段 B"],
      }),
    ]);
  });

  it("groups by document id when document id is zero", () => {
    const groups = groupChatSources([
      { chunk_id: "0:0", document_id: 0, document_name: "系统文档 0", snippet: "片段 0A" },
      { chunk_id: "0:1", document_id: 0, document_name: "系统文档 0", snippet: "片段 0B" },
    ]);

    expect(groups).toEqual([
      {
        key: "doc-0",
        title: "系统文档 0",
        count: 2,
        snippets: ["片段 0A", "片段 0B"],
      },
    ]);
  });
});
