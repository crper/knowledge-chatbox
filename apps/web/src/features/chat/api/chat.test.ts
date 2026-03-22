import { jsonResponse } from "@/test/http";
import {
  archiveChatMessageAttachment,
  createChatSession,
  deleteChatMessage,
  deleteChatSession,
  getChatMessages,
  getChatSessions,
  renameChatSession,
  sendChatMessage,
  updateChatSession,
} from "./chat";

function apiPath(path: string) {
  return expect.stringMatching(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

describe("chat api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a chat session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: { id: 1, title: "Session A", reasoning_mode: "default" },
        error: null,
      }),
    );
    const result = await createChatSession({ title: "Session A" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.id).toBe(1);
    expect(result.reasoning_mode).toBe("default");
  });

  it("gets chat messages in order", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: 1,
            session_id: 7,
            role: "user",
            content: "hi",
            status: "succeeded",
            client_request_id: "req-1",
            error_message: null,
            retry_of_message_id: null,
            reply_to_message_id: null,
            sources_json: null,
            created_at: "2026-03-19T08:00:00Z",
          },
          {
            id: 2,
            session_id: 7,
            role: "assistant",
            content: "hello",
            status: "succeeded",
            client_request_id: null,
            error_message: null,
            retry_of_message_id: null,
            reply_to_message_id: 1,
            sources_json: null,
            created_at: "2026-03-19T08:00:01Z",
          },
        ],
        error: null,
      }),
    );
    const result = await getChatMessages(7);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/7/messages"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result[0]?.id).toBe(1);
    expect(result[1]?.id).toBe(2);
  });

  it("sends a chat message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          user_message: {
            id: 10,
            session_id: 7,
            role: "user",
            content: "hello",
            status: "succeeded",
            client_request_id: "req-1",
            error_message: null,
            retry_of_message_id: null,
            reply_to_message_id: null,
            sources_json: null,
            created_at: "2026-03-19T08:00:00Z",
          },
          assistant_message: {
            id: 11,
            session_id: 7,
            role: "assistant",
            content: "world",
            status: "succeeded",
            client_request_id: null,
            error_message: null,
            retry_of_message_id: null,
            reply_to_message_id: 10,
            sources_json: null,
            created_at: "2026-03-19T08:00:01Z",
          },
        },
        error: null,
      }),
    );
    await sendChatMessage(7, {
      content: "hello",
      client_request_id: "req-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/7/messages"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists chat sessions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ id: 1, title: "Session A", reasoning_mode: "default" }],
        error: null,
      }),
    );
    const result = await getChatSessions();

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toHaveLength(1);
  });

  it("renames a chat session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: { id: 1, title: "Renamed Session", reasoning_mode: "default" },
        error: null,
      }),
    );
    const result = await renameChatSession(1, { title: "Renamed Session" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/1"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(result.title).toBe("Renamed Session");
  });

  it("updates the session reasoning mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: { id: 1, title: "Session A", reasoning_mode: "on" },
        error: null,
      }),
    );
    const result = await updateChatSession(1, { reasoning_mode: "on" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/1"),
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"reasoning_mode":"on"'),
      }),
    );
    expect(result.reasoning_mode).toBe("on");
  });

  it("deletes a failed chat message", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, data: { deleted: true }, error: null }));

    await deleteChatMessage(10);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/messages/10"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("archives a chat attachment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          id: 10,
          session_id: 7,
          role: "assistant",
          content: "hello",
          status: "succeeded",
          client_request_id: null,
          error_message: null,
          retry_of_message_id: null,
          reply_to_message_id: 1,
          sources_json: null,
          created_at: "2026-03-19T08:00:01Z",
          attachments_json: [],
        },
        error: null,
      }),
    );
    await archiveChatMessageAttachment(10, "att-1", { document_revision_id: 99 });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/messages/10/attachments/att-1/archive"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deletes a chat session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, data: { deleted: true }, error: null }));

    await deleteChatSession(7);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/7"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
