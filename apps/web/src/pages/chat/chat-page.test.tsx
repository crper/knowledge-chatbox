import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { i18n } from "@/i18n";
import { toast } from "sonner";

import type { ChatMessageItem } from "@/features/chat/api/chat";
import { useChatStreamStore } from "@/features/chat/store/chat-stream-store";
import { useChatUiStore } from "@/features/chat/store/chat-ui-store";
import { useUiStore } from "@/lib/store/ui-store";
import { AppProviders } from "@/providers/app-providers";
import { AppRouter } from "@/router";
import { jsonResponse } from "@/test/http";
import { mockMobileViewport } from "@/test/viewport";

type MockChatAttachment = NonNullable<ChatMessageItem["attachments_json"]>[number] & {
  document_id?: number | null;
  document_revision_id?: number | null;
};

type MockChatMessage = Omit<ChatMessageItem, "attachments_json"> & {
  attachments_json?: MockChatAttachment[] | null;
};

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  headers: Record<string, string> = {};
  method = "";
  onabort: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onerror: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onload: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  requestBody: Document | XMLHttpRequestBodyInit | null = null;
  responseText = "";
  status = 0;
  statusText = "";
  upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
  url = "";
  withCredentials = false;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.requestBody = body ?? null;
  }

  abort() {
    this.onabort?.(new ProgressEvent("abort"));
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent<EventTarget>);
  }

  respond(status: number, responseText: string, statusText = "OK") {
    this.status = status;
    this.responseText = responseText;
    this.statusText = statusText;
    this.onload?.(new ProgressEvent("load"));
  }
}

function endsWithApiPath(input: unknown, path: string) {
  return typeof input === "string" && input.endsWith(path);
}

function buildUploadPayload(overrides?: {
  document_id?: number;
  id?: number;
  name?: string;
  status?: string;
  version?: number;
}) {
  const documentId = overrides?.document_id ?? 199;
  const revisionId = overrides?.id ?? 99;
  const name = overrides?.name ?? "image.png";
  const status = overrides?.status ?? "indexed";
  const version = overrides?.version ?? 1;

  return {
    deduplicated: false,
    document: {
      created_at: "2026-03-19T08:00:00Z",
      created_by_user_id: 1,
      id: documentId,
      latest_revision: null,
      logical_name: name,
      space_id: 1,
      status: "active",
      title: name,
      updated_at: "2026-03-19T09:00:00Z",
      updated_by_user_id: 1,
    },
    latest_revision: {
      chunk_count: 3,
      created_at: "2026-03-19T08:00:00Z",
      created_by_user_id: 1,
      document_id: documentId,
      error_message: null,
      file_size: 12,
      file_type: "png",
      id: revisionId,
      indexed_at: "2026-03-19T09:00:00Z",
      ingest_status: status,
      mime_type: "image/png",
      normalized_path: `/normalized/${name}`,
      revision_no: version,
      source_filename: name,
      source_path: `/uploads/${name}`,
      supersedes_revision_id: null,
      updated_at: "2026-03-19T09:00:00Z",
      updated_by_user_id: 1,
    },
  };
}

function buildAuthenticatedFetch(options?: {
  delayCreateSession?: boolean;
  messageCount?: number;
  messages?: MockChatMessage[];
  messagesBySession?: Record<number, MockChatMessage[]>;
  sessions?: Array<{ id: number; title: string | null }>;
  streamErrorResponse?: {
    body: unknown;
    status: number;
  };
  streamFrames?: string[];
  streamFramesSequence?: string[][];
  streamFinalDelayMs?: number;
  streamFramesBySession?: Record<number, string[]>;
}) {
  const buildSessionContext = (sessionId: number) => {
    const mappedMessages = options?.messagesBySession?.[sessionId];
    const baseMessages =
      mappedMessages ??
      options?.messages ??
      (sessionId === 1
        ? [
            {
              id: 1,
              role: "user",
              content: "hello",
              status: "failed",
              error_message: "provider unavailable",
              attachments_json: [
                {
                  attachment_id: "history-image",
                  type: "image",
                  name: "history.png",
                  mime_type: "image/png",
                  size_bytes: 1,
                },
              ],
              sources_json: null,
            },
            {
              id: 2,
              role: "assistant",
              content: "## Title\n\n|a|b|\n|-|-|\n|1|2|",
              status: "succeeded",
              error_message: null,
              sources_json: [
                {
                  chunk_id: "1:0",
                  section_title: "Guide",
                  page_number: 2,
                  snippet: "OpenAI guide snippet",
                },
              ],
            },
            ...(streamedUserMessage
              ? [
                  streamedUserMessage,
                  streamedAssistantMessage ?? {
                    id: 4,
                    role: "assistant",
                    content: "streamed answer",
                    status: "succeeded",
                    sources_json: [],
                  },
                ]
              : []),
          ]
        : []);
    const attachments = (baseMessages as MockChatMessage[])
      .flatMap((message) => message.attachments_json ?? [])
      .reduce<MockChatAttachment[]>((result, attachment) => {
        const key =
          attachment.document_id != null
            ? `document:${attachment.document_id}`
            : attachment.document_revision_id != null
              ? `version:${attachment.document_revision_id}`
              : `attachment:${attachment.attachment_id}`;
        const existingIndex = result.findIndex((item) => {
          const itemKey =
            item.document_id != null
              ? `document:${item.document_id}`
              : item.document_revision_id != null
                ? `version:${item.document_revision_id}`
                : `attachment:${item.attachment_id}`;
          return itemKey === key;
        });
        if (existingIndex >= 0) {
          result[existingIndex] = attachment;
          return result;
        }
        result.push(attachment);
        return result;
      }, []);
    const latestAssistantMessage = [...(baseMessages as MockChatMessage[])]
      .reverse()
      .find((message) => message.role === "assistant");

    return {
      session_id: sessionId,
      attachment_count: attachments.length,
      attachments,
      latest_assistant_message_id: latestAssistantMessage?.id ?? null,
      latest_assistant_sources: latestAssistantMessage?.sources_json ?? [],
    };
  };

  const sessions = (
    options?.sessions ?? [
      { id: 1, title: "Session A" },
      { id: 2, title: "Session B" },
    ]
  ).map((session) => ({ ...session }));
  const streamFramesQueue = options?.streamFramesSequence?.map((frames) => [...frames]) ?? null;
  let streamedUserMessage: {
    attachments_json?: Array<{
      archived_at?: string | null;
      attachment_id: string;
      document_id?: number | null;
      document_revision_id?: number | null;
      mime_type: string;
      name: string;
      type: string;
    }>;
    content: string;
    id: number;
    role: "user";
    status: "succeeded";
    sources_json: [];
  } | null = null;
  let streamedAssistantMessage: ChatMessageItem | null = null;
  const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    if (input.endsWith("/api/auth/bootstrap")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            authenticated: true,
            access_token: "fresh-token",
            expires_in: 900,
            token_type: "Bearer",
            user: {
              id: 1,
              username: "admin",
              role: "admin",
              status: "active",
              theme_preference: "system",
            },
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/refresh")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            access_token: "fresh-token",
            expires_in: 900,
            token_type: "Bearer",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/me")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            username: "admin",
            role: "admin",
            status: "active",
            theme_preference: "system",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/settings")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            provider_profiles: {
              openai: {
                api_key: "********",
                base_url: "https://api.openai.com/v1",
                chat_model: "gpt-5.4",
                embedding_model: "text-embedding-3-small",
                vision_model: "gpt-5.4",
              },
              anthropic: {
                api_key: null,
                base_url: "https://api.anthropic.com",
                chat_model: "claude-sonnet-4-5",
                vision_model: "claude-sonnet-4-5",
              },
              voyage: {
                api_key: null,
                base_url: "https://api.voyageai.com/v1",
                embedding_model: "voyage-3.5",
              },
              ollama: {
                api_key: null,
                base_url: "http://host.docker.internal:11434",
                chat_model: "qwen3.5:4b",
                embedding_model: "nomic-embed-text",
                vision_model: "qwen3.5:4b",
              },
            },
            response_route: { provider: "openai", model: "gpt-5.4" },
            embedding_route: { provider: "openai", model: "text-embedding-3-small" },
            pending_embedding_route: null,
            vision_route: { provider: "openai", model: "gpt-5.4" },
            system_prompt: "prompt",
            provider_timeout_seconds: 60,
            active_index_generation: 3,
            building_index_generation: null,
            index_rebuild_status: "idle",
            rebuild_started: false,
            reindex_required: false,
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/chat/profile")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            configured: true,
            provider: "openai",
            model: "gpt-5.4",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/chat/sessions") && init?.method === "POST") {
      const body =
        typeof init.body === "string" ? (JSON.parse(init.body) as { title?: string | null }) : {};
      const nextSession = { id: 3, title: body.title ?? null };
      if (options?.delayCreateSession) {
        return new Promise(() => {});
      }

      sessions.unshift(nextSession);
      return Promise.resolve(jsonResponse({ success: true, data: nextSession, error: null }));
    }

    if (input.endsWith("/api/chat/sessions")) {
      return Promise.resolve(jsonResponse({ success: true, data: sessions, error: null }));
    }

    if (input.endsWith("/api/chat/sessions/1") && init?.method === "PATCH") {
      sessions[0] = { id: 1, title: "Session A Renamed" };
      return Promise.resolve(jsonResponse({ success: true, data: sessions[0], error: null }));
    }

    if (input.endsWith("/api/chat/sessions/1") && init?.method === "DELETE") {
      sessions.splice(
        sessions.findIndex((session) => session.id === 1),
        1,
      );
      return Promise.resolve(jsonResponse({ success: true, data: { deleted: true }, error: null }));
    }

    if (input.endsWith("/api/chat/runs/active")) {
      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    }

    const sessionContextMatch = input.match(/\/api\/chat\/sessions\/(\d+)\/context$/);
    if (sessionContextMatch) {
      const sessionId = Number(sessionContextMatch[1]);
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: buildSessionContext(sessionId),
          error: null,
        }),
      );
    }

    if (
      input.includes("/api/chat/sessions/") &&
      input.endsWith("/messages/stream") &&
      init?.method === "POST"
    ) {
      if (options?.streamErrorResponse) {
        return Promise.resolve(
          jsonResponse(options.streamErrorResponse.body, {
            status: options.streamErrorResponse.status,
          }),
        );
      }

      const sessionIdMatch = input.match(/\/api\/chat\/sessions\/(\d+)\/messages\/stream$/);
      const sessionId = Number(sessionIdMatch?.[1] ?? 1);
      const requestBody =
        typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
      const payload = JSON.parse(requestBody) as {
        attachments?: Array<{
          attachment_id: string;
          type: string;
          name: string;
          mime_type: string;
        }>;
        content?: string;
      };
      const frames = streamFramesQueue?.shift() ??
        options?.streamFramesBySession?.[sessionId] ??
        options?.streamFrames ?? [
          `event: run.started\ndata: {"run_id":${sessionId * 10 + 5},"session_id":${sessionId},"user_message_id":${sessionId * 10 + 3},"assistant_message_id":${sessionId * 10 + 4}}\n\n`,
          `event: message.delta\ndata: {"run_id":${sessionId * 10 + 5},"assistant_message_id":${sessionId * 10 + 4},"delta":"streamed answer"}\n\n`,
          `event: sources.final\ndata: {"run_id":${sessionId * 10 + 5},"assistant_message_id":${sessionId * 10 + 4},"sources":[]}\n\n`,
          `event: run.completed\ndata: {"run_id":${sessionId * 10 + 5},"session_id":${sessionId},"assistant_message_id":${sessionId * 10 + 4}}\n\n`,
          "event: done\ndata: {}\n\n",
        ];
      const runStartedFrame = frames.find((frame) => frame.startsWith("event: run.started"));
      const runFailedFrame = frames.find((frame) => frame.startsWith("event: run.failed"));
      const startedPayload = runStartedFrame
        ? (JSON.parse(runStartedFrame.split("data: ")[1]!.trim()) as {
            assistant_message_id?: number;
            user_message_id?: number;
          })
        : {};
      const failedPayload = runFailedFrame
        ? (JSON.parse(runFailedFrame.split("data: ")[1]!.trim()) as {
            assistant_message_id?: number;
            error_message?: string;
          })
        : null;
      streamedUserMessage = {
        attachments_json: payload.attachments,
        content: payload.content ?? "",
        id: startedPayload.user_message_id ?? 3,
        role: "user",
        status: "succeeded",
        sources_json: [],
      };
      streamedAssistantMessage = failedPayload
        ? {
            id: failedPayload.assistant_message_id ?? startedPayload.assistant_message_id ?? 4,
            role: "assistant",
            content: "",
            status: "failed",
            error_message: failedPayload.error_message ?? "provider unavailable",
            reply_to_message_id: startedPayload.user_message_id ?? 3,
            sources_json: [],
          }
        : {
            id: startedPayload.assistant_message_id ?? 4,
            role: "assistant",
            content: "streamed answer",
            status: "succeeded",
            error_message: null,
            reply_to_message_id: startedPayload.user_message_id ?? 3,
            sources_json: [],
          };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;

          const pushFrame = () => {
            if (index >= frames.length) {
              controller.close();
              return;
            }

            controller.enqueue(encoder.encode(frames[index]!));
            index += 1;
            window.setTimeout(pushFrame, index < 3 ? 0 : (options?.streamFinalDelayMs ?? 25));
          };

          pushFrame();
        },
      });

      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    }

    const sessionMessagesMatch = input.match(/\/api\/chat\/sessions\/(\d+)\/messages(?:\?(.*))?$/);
    if (sessionMessagesMatch) {
      const sessionId = Number(sessionMessagesMatch[1]);
      const params = new URL(input, "http://testserver").searchParams;
      const limitParam = params.get("limit");
      const beforeIdParam = params.get("before_id");

      if (options?.messageCount) {
        const allMessages = Array.from({ length: options.messageCount! }, (_, index) => ({
          id: index + 1,
          role: index % 2 === 0 ? "user" : "assistant",
          content: `message ${index + 1}`,
          status: "succeeded",
          sources_json: null,
        }));
        const limit = limitParam ? Number(limitParam) : null;
        const beforeId = beforeIdParam ? Number(beforeIdParam) : null;
        const filteredMessages =
          limit === null
            ? allMessages
            : beforeId === null
              ? allMessages.slice(-limit)
              : allMessages.filter((message) => message.id < beforeId).slice(-limit);

        return Promise.resolve(
          jsonResponse({
            success: true,
            data: filteredMessages,
            error: null,
          }),
        );
      }

      const mappedMessages = options?.messagesBySession?.[sessionId];
      if (mappedMessages) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: mappedMessages,
            error: null,
          }),
        );
      }

      if (options?.messages) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: options.messages,
            error: null,
          }),
        );
      }

      if (sessionId !== 1) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [],
            error: null,
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: [
            {
              id: 1,
              role: "user",
              content: "hello",
              status: "failed",
              error_message: "provider unavailable",
              attachments_json: [
                {
                  type: "image",
                  name: "history.png",
                  mime_type: "image/png",
                },
              ],
              sources_json: null,
            },
            {
              id: 2,
              role: "assistant",
              content: "## Title\n\n|a|b|\n|-|-|\n|1|2|",
              status: "succeeded",
              error_message: null,
              sources_json: [
                {
                  chunk_id: "1:0",
                  section_title: "Guide",
                  page_number: 2,
                  snippet: "OpenAI guide snippet",
                },
              ],
            },
            ...(streamedUserMessage
              ? [
                  streamedUserMessage,
                  streamedAssistantMessage ?? {
                    id: 4,
                    role: "assistant",
                    content: "streamed answer",
                    status: "succeeded",
                    sources_json: [],
                  },
                ]
              : []),
          ],
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/chat/messages/1") && init?.method === "DELETE") {
      return Promise.resolve(jsonResponse({ success: true, data: { deleted: true }, error: null }));
    }

    if (input.endsWith("/api/auth/preferences")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            username: "admin",
            role: "admin",
            status: "active",
            theme_preference: "dark",
          },
          error: null,
        }),
      );
    }

    return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("chat workspace", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    localStorage.clear();
    MockXMLHttpRequest.instances = [];
    vi.restoreAllMocks();
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
    useChatUiStore.setState({
      activeSessionId: null,
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });
    useChatStreamStore.setState({ runsById: {} });
  });

  it("renders a three-column chat workspace with session controls and an overview-first context panel", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(screen.getByText("会话")).toBeInTheDocument();
    expect(screen.getByText("工作模式")).toBeInTheDocument();
    expect(screen.queryByText("最近会话")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账户菜单" })).toBeInTheDocument();
    expect(screen.queryByText("工作台工具")).not.toBeInTheDocument();
    expect(screen.queryByText("系统管理")).not.toBeInTheDocument();
    expect(screen.queryByText("个人操作")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用户" })).not.toBeInTheDocument();
    expect(screen.queryByText("⌘B")).not.toBeInTheDocument();
    expect(screen.getByText("会话概览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起上下文侧栏" })).toBeInTheDocument();
    expect(screen.queryByText("首条预览")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "系统设置" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("shows the desktop chat workspace with sessions, messages, and resource context", async () => {
    buildAuthenticatedFetch({ messageCount: 120 });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-desktop-layout")).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "消息输入" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "去资源区添加资料" })).toBeInTheDocument();
  });

  it("requests only the latest message window on initial chat load", async () => {
    const fetchMock = buildAuthenticatedFetch({ messageCount: 120 });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("textbox", { name: "消息输入" })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            typeof url === "string" && url.includes("/api/chat/sessions/1/messages?limit=80"),
        ),
      ).toBe(true);
    });
  });

  it("toggles the left chat sidebar with cmd/ctrl+b", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("textbox", { name: "搜索会话" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "b", metaKey: true });

    expect(screen.queryByRole("textbox", { name: "搜索会话" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开会话侧栏" }));

    expect(await screen.findByRole("textbox", { name: "搜索会话" })).toBeInTheDocument();
  });

  it("toggles the right context sidebar with an explicit collapse control", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByText("会话概览")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起上下文侧栏" }));

    expect(screen.queryByText("提问后，这里会显示附件和引用。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开上下文侧栏" }));

    expect(await screen.findByText("会话概览")).toBeInTheDocument();
  });

  it("renders compact icon-only rails after collapsing desktop sidebars", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("textbox", { name: "搜索会话" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "b", metaKey: true });
    const leftRail = screen.getByRole("button", { name: "展开会话侧栏" });
    expect(leftRail.textContent?.trim()).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "收起上下文侧栏" }));
    const rightRail = screen.getByRole("button", { name: "展开上下文侧栏" });
    expect(rightRail.textContent?.trim()).toBe("");
  });

  it("renders a guided empty-session canvas after creating a new session", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "新建会话" }));

    expect(await screen.findByRole("heading", { name: "未命名会话" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去资源区添加资料" })).toBeInTheDocument();
    expect(screen.queryByText("1. 准备资料")).not.toBeInTheDocument();
    expect(screen.queryByText("2. 提出具体问题")).not.toBeInTheDocument();
    expect(screen.queryByText("3. 对照引用")).not.toBeInTheDocument();

    const createSessionCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" && url.endsWith("/api/chat/sessions") && init?.method === "POST",
    );

    expect(createSessionCall).toBeDefined();
    expect(JSON.parse(String(createSessionCall?.[1]?.body))).toMatchObject({ title: null });
  });

  it("clears stale local draft and attachments for a newly created session id", async () => {
    buildAuthenticatedFetch();
    useChatUiStore.setState({
      activeSessionId: null,
      attachmentsBySession: {
        "3": [
          {
            id: "stale-attachment",
            kind: "image",
            name: "stale.png",
            status: "queued",
            file: new File(["hello"], "stale.png", { type: "image/png" }),
            mimeType: "image/png",
          },
        ],
      },
      draftsBySession: {
        "3": "stale draft",
      },
      sendShortcut: "enter",
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "新建会话" }));

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
      expect(screen.queryByText("stale.png")).not.toBeInTheDocument();
    });
  });

  it("shows an explicit empty state when session search has no matches", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "搜索会话" }), {
      target: { value: "not-found" },
    });

    expect(await screen.findByText("没有匹配的会话")).toBeInTheDocument();
    expect(screen.getByText("换个关键词，或直接新建一个会话继续。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除搜索" })).toBeInTheDocument();
  });

  it("renders markdown and sources for the active session", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("OpenAI guide snippet")).toBeInTheDocument();
    });
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看引用 1" })).toBeInTheDocument();
  });

  it("uses a compact chat header and avoids duplicate composer guidance", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const sessionHeading = await screen.findByRole("heading", { name: "Session A" });
    expect(sessionHeading).toBeInTheDocument();
    expect(
      screen.queryByText("回答会结合当前会话上下文，并在右侧持续整理引用。"),
    ).not.toBeInTheDocument();
  });

  it("embeds the composer directly without an extra outer surface shell", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const composerShell = await screen.findByTestId("message-input-shell");
    const composerRegion = composerShell.closest("[data-composer-embed]");

    expect(composerRegion).toHaveAttribute("data-composer-embed", "direct");
  });

  it("avoids rendering every row for very long sessions", async () => {
    buildAuthenticatedFetch({ messageCount: 120 });

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(document.querySelector('[data-chat-contained="true"]')).toBeNull();
    await waitFor(() => {
      expect(screen.getAllByTestId("chat-message-virtual-item").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("chat-message-virtual-item").length).toBeLessThan(80);
    });
  });

  it("stores draft in localStorage", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "draft question" },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("knowledge-chatbox-chat-drafts")).toContain(
        "draft question",
      );
    });
  });

  it("stores draft by session and keeps it isolated when switching sessions", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "session-1 draft" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Session B" }));
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "session-2 draft" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Session A" }));

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("session-1 draft");
    });
  });

  it("submits through the streaming flow and clears the current session draft", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "hello stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByLabelText("消息输入")).toHaveValue("");

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
    });
  });

  it("does not refetch the current message window after a successful stream completes", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "hello stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("streamed answer")).toBeInTheDocument();

    const messageWindowCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/api/chat/sessions/1/messages?limit=80"),
    );

    expect(messageWindowCalls).toHaveLength(1);
  });

  it("marks the temporary assistant message as failed when the stream ends unexpectedly", async () => {
    buildAuthenticatedFetch({
      streamFrames: [
        'event: run.started\ndata: {"run_id":5,"session_id":1,"assistant_message_id":4}\n\n',
        'event: message.delta\ndata: {"run_id":5,"assistant_message_id":4,"delta":"作为"}\n\n',
      ],
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "hello stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.queryByText("正在生成回答")).not.toBeInTheDocument();
    });

    expect(await screen.findByText("本次生成连接中断，请重试。")).toBeInTheDocument();
    expect(screen.getByText("作为")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    });
  });

  it("shows a toast when the stream request fails before any runtime event arrives", async () => {
    buildAuthenticatedFetch({
      streamErrorResponse: {
        status: 409,
        body: {
          detail: {
            code: "chat_message_conflict",
            message: "当前请求已失效，请重新发送。",
          },
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "hello stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("当前请求已失效，请重新发送。")).toBeInTheDocument();
    expect(screen.getByLabelText("消息输入")).toHaveValue("hello stream");
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
  });

  it("shows retry for a failed assistant stream and retries against the user message id", async () => {
    const fetchMock = buildAuthenticatedFetch({
      messages: [],
      streamFrames: [
        'event: run.started\ndata: {"run_id":5,"session_id":1,"user_message_id":3,"assistant_message_id":4}\n\n',
        'event: message.delta\ndata: {"run_id":5,"assistant_message_id":4,"delta":"作为"}\n\n',
      ],
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("消息输入"), {
      target: { value: "hello stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await screen.findByText("本次生成连接中断，请重试。");
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => {
      const streamCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          endsWithApiPath(url, "/api/chat/sessions/1/messages/stream") &&
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          init.method === "POST",
      );

      expect(streamCalls).toHaveLength(2);

      const retryInit = streamCalls[1]?.[1];
      const retryBody =
        retryInit && typeof retryInit === "object" && "body" in retryInit
          ? JSON.parse(String(retryInit.body))
          : null;

      expect(retryBody).toMatchObject({
        content: "hello stream",
        retry_of_message_id: 3,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    });
  });

  it("supports sending from Enter by default", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const input = await screen.findByLabelText("消息输入");
    fireEvent.change(input, {
      target: { value: "send with shortcut" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            endsWithApiPath(url, "/api/chat/sessions/1/messages/stream") &&
            typeof init === "object" &&
            init !== null &&
            "method" in init &&
            init.method === "POST",
        ),
      ).toHaveLength(1);
    });

    expect(await screen.findByText("streamed answer")).toBeInTheDocument();
  });

  it("sends text with attachments from Enter and clears the composer immediately", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    const attachInput = await screen.findByLabelText("附加资源", {
      selector: 'input[type="file"]',
    });
    fireEvent.change(attachInput, {
      target: { files: [new File(["hello"], "image.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("image.png")).toBeInTheDocument();

    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, {
      target: { value: "家里的师傅" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
      expect(screen.queryByTestId("message-input-attachments")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    });

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    MockXMLHttpRequest.instances[0]!.emitProgress(10, 10);
    MockXMLHttpRequest.instances[0]!.respond(
      201,
      JSON.stringify({
        success: true,
        data: buildUploadPayload(),
        error: null,
      }),
    );

    await waitFor(() => {
      const streamCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          endsWithApiPath(url, "/api/chat/sessions/1/messages/stream") &&
          typeof init === "object" &&
          init !== null &&
          "body" in init,
      );

      expect(streamCall).toBeDefined();

      const [, init] = streamCall!;
      const requestBody =
        typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
      const parsedPayload = JSON.parse(requestBody) as {
        attachments?: Array<{
          attachment_id: string;
          document_id: number;
          document_revision_id: number;
          type: string;
          mime_type: string;
          name: string;
        }>;
        content?: string;
      };

      expect(parsedPayload.content).toBe("家里的师傅");
      expect(parsedPayload.attachments).toHaveLength(1);
      expect(parsedPayload.attachments?.[0]).toMatchObject({
        attachment_id: expect.any(String),
        document_id: 199,
        document_revision_id: 99,
        type: "image",
        mime_type: "image/png",
        name: "image.png",
      });
    });
  });

  it("does not expose a send shortcut picker in the composer", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("消息输入")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "发送快捷键" })).not.toBeInTheDocument();
  });

  it("shows failed message error, supports editing, and deleting failed message", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByText("provider unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("hello");
    });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            endsWithApiPath(url, "/api/chat/messages/1") &&
            typeof init === "object" &&
            init !== null &&
            "method" in init &&
            init.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("shows attachment feedback in the composer", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    const attachInput = await screen.findByLabelText("附加资源", {
      selector: 'input[type="file"]',
    });
    fireEvent.change(attachInput, {
      target: { files: [new File(["hello"], "upload.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("upload.png")).toBeInTheDocument();
    expect(screen.getByText("待发送")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => endsWithApiPath(url, "/api/documents/upload")),
    ).toBe(false);
  });

  it("does not append duplicate local attachments when the same file is selected twice", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    const attachInput = await screen.findByLabelText("附加资源", {
      selector: 'input[type="file"]',
    });
    const selectedAt = 1_710_000_000_000;

    fireEvent.change(attachInput, {
      target: {
        files: [new File(["hello"], "dedupe.png", { type: "image/png", lastModified: selectedAt })],
      },
    });

    const attachmentPanel = await screen.findByTestId("message-input-attachments");
    expect(within(attachmentPanel).getByText("dedupe.png")).toBeInTheDocument();
    expect(within(attachmentPanel).getByText("附件 1")).toBeInTheDocument();

    fireEvent.change(attachInput, {
      target: {
        files: [new File(["hello"], "dedupe.png", { type: "image/png", lastModified: selectedAt })],
      },
    });

    await waitFor(() => {
      expect(within(attachmentPanel).getAllByText("dedupe.png")).toHaveLength(1);
      expect(within(attachmentPanel).getByText("附件 1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "看这张图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    MockXMLHttpRequest.instances[0]!.respond(
      201,
      JSON.stringify({
        success: true,
        data: buildUploadPayload({
          name: "dedupe.png",
        }),
        error: null,
      }),
    );

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
      const streamCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          endsWithApiPath(url, "/api/chat/sessions/1/messages/stream") &&
          typeof init === "object" &&
          init !== null &&
          "body" in init,
      );

      expect(streamCall).toBeDefined();

      const [, init] = streamCall!;
      const requestBody =
        typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
      const parsedPayload = JSON.parse(requestBody) as {
        attachments?: Array<{
          attachment_id: string;
          name: string;
        }>;
      };

      expect(parsedPayload.attachments).toHaveLength(1);
      expect(parsedPayload.attachments?.[0]?.name).toBe("dedupe.png");
    });
  });

  it("restores the composer snapshot when streaming fails after attachments upload", async () => {
    buildAuthenticatedFetch({
      streamFrames: [
        'event: run.started\ndata: {"run_id":5,"session_id":1,"user_message_id":3,"assistant_message_id":4}\n\n',
        'event: run.failed\ndata: {"run_id":5,"session_id":1,"assistant_message_id":4,"error_message":"provider unavailable"}\n\n',
      ],
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const attachInput = await screen.findByLabelText("附加资源", {
      selector: 'input[type="file"]',
    });
    fireEvent.change(attachInput, {
      target: { files: [new File(["hello"], "image.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("image.png")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "看这张图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
      expect(screen.queryByTestId("message-input-attachments")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    });

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    MockXMLHttpRequest.instances[0]!.emitProgress(10, 10);
    MockXMLHttpRequest.instances[0]!.respond(
      201,
      JSON.stringify({
        success: true,
        data: buildUploadPayload(),
        error: null,
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("看这张图");
      expect(
        within(screen.getByTestId("message-input-attachments")).getByText("image.png"),
      ).toBeInTheDocument();
      expect(screen.getByText("已上传")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    });
  });

  it("pastes clipboard images into the composer and uploads them on send", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const composer = await screen.findByLabelText("消息输入");
    const pastedImage = new File(["hello"], "", { type: "image/png" });
    fireEvent.paste(composer, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => pastedImage,
          },
        ],
      },
    });

    expect(await screen.findByText("pasted-image.png")).toBeInTheDocument();
    expect(screen.getByText("待发送")).toBeInTheDocument();

    fireEvent.change(composer, {
      target: { value: "分析这张截图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    MockXMLHttpRequest.instances[0]!.emitProgress(10, 10);
    MockXMLHttpRequest.instances[0]!.respond(
      201,
      JSON.stringify({
        success: true,
        data: buildUploadPayload({
          name: "pasted-image.png",
        }),
        error: null,
      }),
    );

    await waitFor(() => {
      const streamCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          endsWithApiPath(url, "/api/chat/sessions/1/messages/stream") &&
          typeof init === "object" &&
          init !== null &&
          "body" in init,
      );

      expect(streamCall).toBeDefined();

      const [, init] = streamCall!;
      const requestBody =
        typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
      const parsedPayload = JSON.parse(requestBody) as {
        attachments?: Array<{
          type: string;
          name: string;
          mime_type: string;
        }>;
      };

      expect(
        MockXMLHttpRequest.instances.some((xhr) => xhr.url.endsWith("/api/documents/upload")),
      ).toBe(true);
      expect(parsedPayload.attachments).toHaveLength(1);
      expect(parsedPayload.attachments?.[0]).toMatchObject({
        type: "image",
        name: "pasted-image.png",
        mime_type: "image/png",
      });
    });
  });

  it("keeps unsupported attachment feedback local to the composer", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const attachInput = await screen.findByLabelText("附加资源", {
      selector: 'input[type="file"]',
    });
    fireEvent.change(attachInput, {
      target: { files: [new File(["fake"], "data.csv", { type: "text/csv" })] },
    });

    expect(await screen.findByText("data.csv")).toBeInTheDocument();
    expect(screen.getByText("上传失败")).toBeInTheDocument();
    expect(
      screen.getAllByText("当前仅支持 txt、md、pdf、docx 和常见图片格式。").length,
    ).toBeGreaterThan(0);
  });

  it("supports renaming a session from the session list", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重命名 Session A" }));
    fireEvent.change(screen.getByLabelText("会话名称"), {
      target: { value: "Session A Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            endsWithApiPath(url, "/api/chat/sessions/1") &&
            typeof init === "object" &&
            init !== null &&
            "method" in init &&
            init.method === "PATCH",
        ),
      ).toBe(true);
    });
  });

  it("supports deleting a session from the session list", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除 Session A" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            endsWithApiPath(url, "/api/chat/sessions/1") &&
            typeof init === "object" &&
            init !== null &&
            "method" in init &&
            init.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("disables creating another session while the request is still pending", async () => {
    buildAuthenticatedFetch({ delayCreateSession: true });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const createButton = await screen.findByRole("button", { name: "新建会话" });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建会话" })).toBeDisabled();
    });
  });

  it("keeps the session switch responsive while sending a streamed request", async () => {
    buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("link", { name: "Session A" }));
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "background run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    fireEvent.click(screen.getByRole("link", { name: "Session B" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
    });
  });

  it("releases the composer lock when switching to another session during a pending send", async () => {
    buildAuthenticatedFetch({ streamFinalDelayMs: 150 });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "background run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session B" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
      expect(screen.getByLabelText("消息输入")).toBeEnabled();
      expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    });
  });

  it("allows sending in another session while the previous session is still streaming", async () => {
    const fetchMock = buildAuthenticatedFetch({ streamFinalDelayMs: 150 });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "background run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    fireEvent.click(screen.getByRole("link", { name: "Session B" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "session two send" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      const streamCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          endsWithApiPath(url, "/api/chat/sessions/2/messages/stream") &&
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          init.method === "POST",
      );

      expect(streamCalls).toHaveLength(1);
    });
  });

  it("keeps the original session locked when switching away and back until its stream finishes", async () => {
    buildAuthenticatedFetch({ streamFinalDelayMs: 150 });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息输入"), {
      target: { value: "background run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session B" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session A" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session A" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
      expect(screen.getByLabelText("消息输入")).toBeDisabled();
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "发送中" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
      expect(screen.getByLabelText("消息输入")).toBeEnabled();
    });
  });

  it("does not carry the retry lock into another session", async () => {
    buildAuthenticatedFetch({
      messages: [
        {
          id: 1,
          role: "user",
          content: "hello",
          status: "succeeded",
          error_message: null,
          sources_json: null,
        },
        {
          id: 2,
          role: "assistant",
          content: "",
          status: "failed",
          error_message: "provider unavailable",
          reply_to_message_id: 1,
          sources_json: [],
        },
      ],
      streamFinalDelayMs: 150,
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session B" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
      expect(screen.getByLabelText("消息输入")).toBeEnabled();
      expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    });
  });

  it("clears the restored composer snapshot after a retry succeeds across session switches", async () => {
    buildAuthenticatedFetch({
      messages: [
        {
          id: 1,
          role: "user",
          content: "文档说了啥",
          status: "succeeded",
          sources_json: [],
          attachments_json: [
            {
              attachment_id: "old-att",
              type: "document",
              name: "old.pdf",
              mime_type: "application/pdf",
              size_bytes: 64,
              document_id: 8,
              document_revision_id: 18,
            },
          ],
        },
        {
          id: 2,
          role: "assistant",
          content: "",
          status: "failed",
          error_message: "provider unavailable",
          reply_to_message_id: 1,
          sources_json: [],
        },
      ],
      streamFinalDelayMs: 150,
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    expect(await screen.findByRole("link", { name: "Session B" })).toBeInTheDocument();
    act(() => {
      useChatUiStore.setState({
        attachmentsBySession: {
          "1": [
            {
              id: "old-att",
              kind: "document",
              name: "old.pdf",
              sizeBytes: 64,
              status: "uploaded",
              mimeType: "application/pdf",
              resourceDocumentId: 8,
              resourceDocumentVersionId: 18,
            },
          ],
        },
        draftsBySession: {
          "1": "文档说了啥",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("文档说了啥");
      expect(
        within(screen.getByTestId("message-input-attachments")).getByText("old.pdf"),
      ).toBeInTheDocument();
    });

    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
      expect(screen.getByLabelText("消息输入")).toBeDisabled();
      expect(screen.queryByTestId("message-input-attachments")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session B" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "Session A" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session A" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发送中" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("消息输入")).toHaveValue("");
      expect(screen.queryByTestId("message-input-attachments")).not.toBeInTheDocument();
    });
  });

  it("keeps newer composer input when retrying an older failed message", async () => {
    buildAuthenticatedFetch({
      messages: [
        {
          id: 1,
          role: "user",
          content: "旧问题",
          status: "succeeded",
          sources_json: [],
          attachments_json: [
            {
              attachment_id: "old-att",
              type: "document",
              name: "old.pdf",
              mime_type: "application/pdf",
              size_bytes: 64,
              document_id: 8,
              document_revision_id: 18,
            },
          ],
        },
        {
          id: 2,
          role: "assistant",
          content: "",
          status: "failed",
          error_message: "provider unavailable",
          reply_to_message_id: 1,
          sources_json: [],
        },
      ],
      streamFinalDelayMs: 150,
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Session A" });
    act(() => {
      useChatUiStore.setState({
        attachmentsBySession: {
          "1": [
            {
              id: "new-att",
              kind: "document",
              name: "new.pdf",
              sizeBytes: 128,
              status: "uploaded",
              mimeType: "application/pdf",
              resourceDocumentId: 12,
              resourceDocumentVersionId: 34,
            },
          ],
        },
        draftsBySession: {
          "1": "后来新写的问题",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("消息输入")).toHaveValue("后来新写的问题");
      expect(
        within(screen.getByTestId("message-input-attachments")).getByText("new.pdf"),
      ).toBeInTheDocument();
    });

    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
      expect(screen.getByLabelText("消息输入")).toHaveValue("后来新写的问题");
      expect(
        within(screen.getByTestId("message-input-attachments")).getByText("new.pdf"),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "发送中" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("消息输入")).toHaveValue("后来新写的问题");
      expect(
        within(screen.getByTestId("message-input-attachments")).getByText("new.pdf"),
      ).toBeInTheDocument();
    });
  });

  it("prefers a persisted succeeded answer over a stale local streaming run after switching sessions", async () => {
    buildAuthenticatedFetch({
      messagesBySession: {
        2: [
          {
            id: 31,
            role: "user",
            content: "第二个会话的问题",
            status: "succeeded",
            sources_json: [],
          },
          {
            id: 32,
            role: "assistant",
            content: "第二个会话的最终答案",
            status: "succeeded",
            reply_to_message_id: 31,
            sources_json: [],
          },
        ],
      },
    });

    useChatUiStore.setState({
      activeSessionId: 2,
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });
    useChatStreamStore.setState({
      runsById: {
        900: {
          runId: 900,
          sessionId: 2,
          assistantMessageId: 32,
          userMessageId: 31,
          userContent: "第二个会话的问题",
          content: "",
          sources: [],
          errorMessage: null,
          status: "streaming",
          toastShown: false,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(await screen.findByText("第二个会话的最终答案")).toBeInTheDocument();
    expect(screen.queryByText("正在生成回答")).not.toBeInTheDocument();
  });

  it("does not request active runs when the workspace relies on local streaming state", async () => {
    const fetchMock = buildAuthenticatedFetch();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url]) => typeof url === "string" && url.endsWith("/api/chat/sessions"),
        ),
      ).toBe(true);
    });

    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === "string" && url.endsWith("/api/chat/runs/active"),
      ),
    ).toBe(false);
  });

  it("shows the background session completion toast in the active locale", async () => {
    buildAuthenticatedFetch();
    const successSpy = vi.spyOn(toast, "success");

    useChatStreamStore.setState({
      runsById: {
        205: {
          runId: 205,
          sessionId: 2,
          assistantMessageId: 24,
          userMessageId: 23,
          userContent: "hello",
          content: "done",
          sources: [],
          errorMessage: null,
          status: "succeeded",
          toastShown: false,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith("Session B 已生成完成。");
    });
  });

  it("uses the localized untitled session fallback in background completion toasts", async () => {
    useUiStore.setState({ language: "en" });
    await i18n.changeLanguage("en");
    buildAuthenticatedFetch({
      sessions: [
        { id: 1, title: "Session A" },
        { id: 2, title: null },
      ],
    });
    const successSpy = vi.spyOn(toast, "success");

    useChatStreamStore.setState({
      runsById: {
        205: {
          runId: 205,
          sessionId: 2,
          assistantMessageId: 24,
          userMessageId: 23,
          userContent: "hello",
          content: "done",
          sources: [],
          errorMessage: null,
          status: "succeeded",
          toastShown: false,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith("Untitled Session is ready.");
    });
  });

  it("prioritizes the main chat canvas on mobile and exposes sessions/context in sheets", async () => {
    buildAuthenticatedFetch();
    mockMobileViewport();

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "打开会话面板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开上下文面板" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Session A" })).toBeInTheDocument();
    expect(screen.queryByLabelText("搜索会话")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开会话面板" }));
    expect(await screen.findByLabelText("搜索会话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Session A" }));

    fireEvent.click(screen.getByRole("button", { name: "打开上下文面板" }));
    expect(await screen.findByText("会话概览")).toBeInTheDocument();
  });
});
