import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { ChatAttachmentItem, ChatMessageItem, ChatSourceItem } from "@/features/chat/api/chat";
import { useChatUiStore } from "@/features/chat/store/chat-ui-store";
import { jsonResponse } from "@/test/http";
import { createTestQueryClient } from "@/test/query-client";
import { ChatResourcePanel } from "./chat-resource-panel";

function buildImageAttachment(name: string): ChatAttachmentItem {
  return {
    attachment_id: `${name}-id`,
    type: "image",
    name,
    mime_type: "image/png",
    size_bytes: 1,
  };
}

function buildDocumentAttachment(name: string): ChatAttachmentItem {
  return {
    attachment_id: `${name}-id`,
    type: "document",
    name,
    mime_type: "application/pdf",
    size_bytes: 1,
  };
}

function withDocumentRevision(
  attachment: ChatAttachmentItem,
  input: { document_id: number; document_revision_id: number },
) {
  return {
    ...attachment,
    document_id: input.document_id,
    document_revision_id: input.document_revision_id,
  } as unknown as ChatAttachmentItem;
}

function buildAssistantMessage(input?: {
  attachments_json?: ChatAttachmentItem[];
  sources_json?: ChatSourceItem[];
}): ChatMessageItem {
  return {
    id: 1,
    role: "assistant",
    content: "答复",
    status: "succeeded",
    attachments_json: input?.attachments_json ?? [],
    sources_json: input?.sources_json ?? [],
  };
}

function stubChatMessagesFetch(messages: ChatMessageItem[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string) => {
      if (input.includes("/api/chat/sessions/1/messages")) {
        return Promise.resolve(jsonResponse({ success: true, data: messages, error: null }));
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    }),
  );
}

function renderResourcePanel() {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <MemoryRouter initialEntries={["/chat/1"]}>
      <Routes>
        <Route
          element={
            <QueryClientProvider client={queryClient}>
              <ChatResourcePanel />
            </QueryClientProvider>
          }
          path="/chat/:sessionId"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChatResourcePanel", () => {
  let originalState = useChatUiStore.getState();

  beforeEach(() => {
    vi.restoreAllMocks();
    originalState = useChatUiStore.getState();
  });

  afterEach(() => {
    useChatUiStore.setState(originalState);
    vi.unstubAllGlobals();
  });

  it("does not issue chat message requests when no session is active", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <Routes>
          <Route
            element={
              <QueryClientProvider client={queryClient}>
                <ChatResourcePanel />
              </QueryClientProvider>
            }
            path="/chat"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a single compact overview card before attachments and references exist", async () => {
    stubChatMessagesFetch([buildAssistantMessage({ attachments_json: [], sources_json: [] })]);

    renderResourcePanel();

    expect(await screen.findByText("0 个附件")).toBeInTheDocument();
    expect(screen.getByText("0 条引用")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去资源区添加资料" })).toBeInTheDocument();
    expect(screen.queryByText("会话附件")).not.toBeInTheDocument();
    expect(screen.queryByText("命中引用")).not.toBeInTheDocument();
  });

  it("shows a compact session summary and groups references by document", async () => {
    stubChatMessagesFetch([
      buildAssistantMessage({
        attachments_json: [
          buildImageAttachment("f2280f620f9045129491d54f4de3997d.png"),
          buildImageAttachment("a21109ebeb2d438f90a49af9e56ce922.png"),
        ],
        sources_json: [
          {
            chunk_id: "10:0",
            document_id: 10,
            document_name: "会话图片附件 1",
            snippet: "片段 A",
          },
          {
            chunk_id: "10:1",
            document_id: 10,
            document_name: "会话图片附件 1",
            snippet: "片段 B",
          },
          {
            chunk_id: "11:0",
            document_id: 11,
            document_name: "夜航记录",
            snippet: "片段 C",
          },
        ],
      }),
    ]);

    renderResourcePanel();

    expect(await screen.findByText("2 个附件")).toBeInTheDocument();
    expect(screen.getByText("2 条引用")).toBeInTheDocument();
    expect(screen.getAllByText("会话图片附件 1").length).toBeGreaterThan(0);
    expect(screen.getByText("夜航记录")).toBeInTheDocument();
  });

  it("deduplicates repeated versions of the same session resource and previews the latest version", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.includes("/api/chat/sessions/1/messages")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [
              buildAssistantMessage({
                attachments_json: [
                  {
                    ...withDocumentRevision(buildImageAttachment("same.png"), {
                      document_id: 7,
                      document_revision_id: 11,
                    }),
                    attachment_id: "image-v1",
                  } as ChatAttachmentItem,
                  {
                    ...withDocumentRevision(buildImageAttachment("same.png"), {
                      document_id: 7,
                      document_revision_id: 12,
                    }),
                    attachment_id: "image-v2",
                  } as ChatAttachmentItem,
                ],
              }),
            ],
            error: null,
          }),
        );
      }

      if (
        input.includes("/api/documents/revisions/11/file") ||
        input.includes("/api/documents/revisions/12/file")
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["image"], { type: "image/png" })),
        });
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderResourcePanel();

    expect(await screen.findByText("附件 1")).toBeInTheDocument();
    expect(screen.getByText("same.png")).toBeInTheDocument();

    const attachmentList = screen.getByTestId("resource-attachment-list");
    expect(within(attachmentList).getAllByRole("listitem")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "预览附件 same.png" }));

    expect(await screen.findByRole("heading", { name: "same.png" })).toBeInTheDocument();
    await waitFor(() => {
      const previewFileCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/documents/revisions/"),
      );

      expect(previewFileCalls).toHaveLength(1);
      expect(previewFileCalls[0]?.[0]).toEqual(
        expect.stringContaining("/api/documents/revisions/12/file"),
      );
      expect(previewFileCalls[0]?.[1]).toEqual(
        expect.objectContaining({
          credentials: "include",
        }),
      );
    });
  });

  it("uses a native bidirectional scroll container for long panel content", async () => {
    const longTitle = "0175dd9e5d6840e98176fb2591e3f81ba9rns2rl98-image_raw_b.png";

    stubChatMessagesFetch([
      buildAssistantMessage({
        attachments_json: [
          buildDocumentAttachment("03-tide-reading-list.pdf"),
          buildDocumentAttachment("04-brick-lane-letter.docx"),
          buildDocumentAttachment(longTitle),
        ],
        sources_json: [
          {
            chunk_id: "12:0",
            document_id: 12,
            document_name: longTitle,
            snippet: "长文件名命中的片段",
          },
        ],
      }),
    ]);

    renderResourcePanel();

    expect(await screen.findByText("1 条引用")).toBeInTheDocument();
    expect(screen.getAllByText(longTitle)).toHaveLength(2);
    expect(screen.getByText("03-tide-reading-list.pdf")).toBeInTheDocument();
    expect(screen.getByText("04-brick-lane-letter.docx")).toBeInTheDocument();
    expect(screen.getByTestId("chat-resource-panel-scroll-container")).toHaveClass("overflow-auto");
    expect(screen.queryByTestId("chat-resource-panel-horizontal-scroll")).not.toBeInTheDocument();
  });

  it("only uses the latest assistant message with sources for grouped references", async () => {
    stubChatMessagesFetch([
      {
        ...buildAssistantMessage({
          sources_json: [
            {
              chunk_id: "10:0",
              document_id: 10,
              document_name: "旧资料",
              snippet: "旧片段",
            },
          ],
        }),
        id: 1,
      },
      {
        ...buildAssistantMessage({
          sources_json: [
            {
              chunk_id: "11:0",
              document_id: 11,
              document_name: "最新资料",
              snippet: "新片段",
            },
          ],
        }),
        id: 2,
      },
    ]);

    renderResourcePanel();

    expect(await screen.findByText("1 条引用")).toBeInTheDocument();
    expect(screen.getByText("最新资料")).toBeInTheDocument();
    expect(screen.getByText("新片段")).toBeInTheDocument();
    expect(screen.queryByText("旧资料")).not.toBeInTheDocument();
    expect(screen.queryByText("旧片段")).not.toBeInTheDocument();
  });

  it("shows empty references when the latest assistant message has no sources", async () => {
    stubChatMessagesFetch([
      {
        ...buildAssistantMessage({
          sources_json: [
            {
              chunk_id: "10:0",
              document_id: 10,
              document_name: "仍应保留的资料",
              snippet: "有效片段",
            },
          ],
        }),
        id: 1,
      },
      {
        ...buildAssistantMessage({
          sources_json: [],
        }),
        id: 2,
      },
    ]);

    renderResourcePanel();

    expect(await screen.findByText("0 条引用")).toBeInTheDocument();
    expect(
      screen.getByText("直接提问也可以；有附件或命中引用后，这里再出现。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("还没有命中引用")).not.toBeInTheDocument();
    expect(screen.queryByText("仍应保留的资料")).not.toBeInTheDocument();
    expect(screen.queryByText("有效片段")).not.toBeInTheDocument();
  });

  it("shows an expanded attachment panel in the resource list by default", async () => {
    stubChatMessagesFetch([
      buildAssistantMessage({
        attachments_json: [
          buildImageAttachment("f2280f620f9045129491d54f4de3997d.png"),
          buildImageAttachment("a21109ebeb2d438f90a49af9e56ce922.png"),
          buildImageAttachment("third.png"),
          buildImageAttachment("fourth.png"),
          buildImageAttachment("fifth.png"),
          buildDocumentAttachment("夜航记录.pdf"),
        ],
      }),
    ]);

    renderResourcePanel();

    expect(await screen.findByText("附件 6")).toBeInTheDocument();
    expect(screen.getByText("0 条引用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();

    expect(screen.getByText("会话图片附件 1")).toBeInTheDocument();
    expect(screen.getByText("会话图片附件 2")).toBeInTheDocument();
    expect(screen.getByText("third.png")).toBeInTheDocument();
    expect(screen.getByText("fourth.png")).toBeInTheDocument();
    expect(screen.getByText("fifth.png")).toBeInTheDocument();
    expect(screen.getByText("夜航记录.pdf")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
    const attachmentList = screen.getByTestId("resource-attachment-list");
    const tiles = within(attachmentList).getAllByRole("listitem");
    expect(tiles).toHaveLength(6);
  });

  it("opens an image viewer when a resource image card is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.includes("/api/chat/sessions/1/messages")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [
              buildAssistantMessage({
                attachments_json: [
                  {
                    ...withDocumentRevision(buildImageAttachment("first.png"), {
                      document_id: 7,
                      document_revision_id: 11,
                    }),
                  } as ChatAttachmentItem,
                  {
                    ...withDocumentRevision(buildImageAttachment("second.png"), {
                      document_id: 8,
                      document_revision_id: 12,
                    }),
                  } as ChatAttachmentItem,
                ],
              }),
            ],
            error: null,
          }),
        );
      }

      if (
        input.includes("/api/documents/revisions/11/file") ||
        input.includes("/api/documents/revisions/12/file")
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["image"], { type: "image/png" })),
        });
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderResourcePanel();

    fireEvent.click(await screen.findByRole("button", { name: "预览附件 first.png" }));

    expect(await screen.findByRole("heading", { name: "first.png" })).toBeInTheDocument();
  });

  it("keeps summary count aligned when the session only has document attachments", async () => {
    stubChatMessagesFetch([
      buildAssistantMessage({
        attachments_json: [buildDocumentAttachment("夜航记录.pdf")],
      }),
    ]);

    renderResourcePanel();

    expect(await screen.findByText("附件 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();

    const attachmentList = screen.getByTestId("resource-attachment-list");
    expect(within(attachmentList).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("夜航记录.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览附件 夜航记录.pdf" })).not.toBeInTheDocument();
  });
});
