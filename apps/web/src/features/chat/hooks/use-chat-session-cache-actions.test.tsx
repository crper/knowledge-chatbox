import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query";

import type { ChatMessageItem, ChatSessionContextItem } from "../api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { useChatSessionCacheActions } from "./use-chat-session-cache-actions";

function CacheActionsHost() {
  const {
    appendStartedUserMessage,
    invalidateSessionArtifacts,
    patchSessionContext,
    patchUserMessageAttachments,
  } = useChatSessionCacheActions();

  return (
    <div>
      <button
        onClick={() =>
          patchSessionContext({
            sessionId: 7,
            latestAssistantMessageId: 12,
            latestAssistantSources: [],
            attachments: [
              {
                attachment_id: "att-1",
                type: "document",
                name: "notes.md",
                mime_type: "text/markdown",
                size_bytes: 12,
                resource_document_id: 88,
              },
            ],
          })
        }
        type="button"
      >
        patch-context
      </button>
      <button
        onClick={() =>
          appendStartedUserMessage({
            sessionId: 7,
            userMessageId: 9,
            content: "queued hello",
          })
        }
        type="button"
      >
        append-started-user
      </button>
      <button onClick={() => void invalidateSessionArtifacts(7)} type="button">
        invalidate
      </button>
      <button
        onClick={() =>
          patchUserMessageAttachments({
            sessionId: 7,
            userMessageId: 3,
            attachments: [
              {
                attachment_id: "att-1",
                type: "document",
                name: "notes.md",
                mime_type: "text/markdown",
                size_bytes: 12,
                resource_document_id: 88,
              },
            ],
          })
        }
        type="button"
      >
        patch-message
      </button>
    </div>
  );
}

describe("useChatSessionCacheActions", () => {
  it("patches session context without replacing unrelated fields", () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData<ChatSessionContextItem | null>(queryKeys.chat.context(7), {
      session_id: 7,
      attachment_count: 0,
      attachments: [],
      latest_assistant_message_id: null,
      latest_assistant_sources: [],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CacheActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "patch-context" }));

    expect(
      queryClient.getQueryData<ChatSessionContextItem | null>(queryKeys.chat.context(7)),
    ).toEqual(
      expect.objectContaining({
        session_id: 7,
        attachment_count: 1,
        latest_assistant_message_id: 12,
        attachments: [
          expect.objectContaining({
            attachment_id: "att-1",
            resource_document_id: 88,
          }),
        ],
      }),
    );
  });

  it("patches user message attachments in the paged message cache", () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(7),
      {
        pageParams: [null],
        pages: [
          [
            {
              id: 3,
              role: "user",
              content: "hello",
              status: "succeeded",
              sources_json: [],
            },
          ],
        ],
      },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CacheActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "patch-message" }));

    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(7),
      )?.pages[0]?.[0],
    ).toEqual(
      expect.objectContaining({
        id: 3,
        attachments_json: [
          expect.objectContaining({
            attachment_id: "att-1",
            resource_document_id: 88,
          }),
        ],
      }),
    );
  });

  it("invalidates the active session message and context queries together", async () => {
    const queryClient = createTestQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <CacheActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "invalidate" }));

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.chat.messagesWindow(7),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.chat.context(7),
      });
    });
  });

  it("appends a started user message once and skips duplicates", () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(7),
      {
        pageParams: [null],
        pages: [[]],
      },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CacheActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "append-started-user" }));
    fireEvent.click(screen.getByRole("button", { name: "append-started-user" }));

    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(7),
      )?.pages[0],
    ).toEqual([
      expect.objectContaining({
        id: 9,
        role: "user",
        content: "queued hello",
      }),
    ]);
  });

  it("returns false when patching user message attachments with invalid attachments", () => {
    const queryClient = createTestQueryClient();
    let patchResult: boolean | undefined;

    function TestHostWithResult() {
      const { patchUserMessageAttachments } = useChatSessionCacheActions();
      return (
        <button
          onClick={() => {
            // 测试传入 null 作为 attachments 的情况
            patchResult = patchUserMessageAttachments({
              sessionId: 7,
              userMessageId: 3,
              attachments: null as unknown as [],
            });
          }}
          type="button"
        >
          patch-invalid
        </button>
      );
    }

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(7),
      {
        pageParams: [null],
        pages: [
          [
            {
              id: 3,
              role: "user",
              content: "hello",
              status: "succeeded",
              sources_json: [],
            },
          ],
        ],
      },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TestHostWithResult />
      </QueryClientProvider>,
    );

    // 测试传入无效 attachments 时返回 false
    fireEvent.click(screen.getByRole("button", { name: "patch-invalid" }));
    expect(patchResult).toBe(false);
  });
});
