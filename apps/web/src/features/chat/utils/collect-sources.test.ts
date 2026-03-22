import { collectSources } from "./collect-sources";
import type { ChatMessageItem } from "../api/chat";

describe("collectSources", () => {
  it("deduplicates sources by chunk id and keeps the latest entry", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "assistant",
        content: "first",
        status: "succeeded",
        sources_json: [
          {
            chunk_id: "doc-1:0",
            section_title: "Old title",
            snippet: "old",
          },
        ],
      },
      {
        id: 2,
        role: "assistant",
        content: "second",
        status: "succeeded",
        sources_json: [
          {
            chunk_id: "doc-1:0",
            section_title: "New title",
            snippet: "new",
          },
          {
            chunk_id: "doc-2:1",
            section_title: "Another",
            snippet: "another",
          },
        ],
      },
    ];

    expect(collectSources(messages)).toEqual([
      {
        chunk_id: "doc-1:0",
        section_title: "New title",
        snippet: "new",
      },
      {
        chunk_id: "doc-2:1",
        section_title: "Another",
        snippet: "another",
      },
    ]);
  });

  it("returns an empty list when no message contains sources", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
    ];

    expect(collectSources(messages)).toEqual([]);
  });
});
