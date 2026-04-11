import { parseChatSourceItem } from "./chat-source";

describe("parseChatSourceItem", () => {
  it("accepts a valid chat source payload", () => {
    expect(
      parseChatSourceItem({
        chunk_id: "chunk-1",
        document_id: 12,
        document_name: "playbook.md",
        page_number: 3,
        score: 0.82,
        section_title: "Intro",
        snippet: "hello world",
      }),
    ).toEqual({
      chunk_id: "chunk-1",
      document_id: 12,
      document_name: "playbook.md",
      page_number: 3,
      score: 0.82,
      section_title: "Intro",
      snippet: "hello world",
    });
  });

  it("rejects payloads without a valid chunk id", () => {
    expect(parseChatSourceItem({ document_id: 12 })).toBeNull();
    expect(parseChatSourceItem({ chunk_id: 123 })).toBeNull();
  });

  it("rejects payloads with invalid optional field types", () => {
    expect(
      parseChatSourceItem({
        chunk_id: "chunk-1",
        document_id: "12",
      }),
    ).toBeNull();

    expect(
      parseChatSourceItem({
        chunk_id: "chunk-1",
        snippet: 42,
      }),
    ).toBeNull();
  });
});
