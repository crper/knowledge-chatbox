import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import {
  archiveChatMessageAttachment,
  createChatSession,
  deleteChatMessage,
  deleteChatSession,
  getChatMessages,
  getChatMessagesWindow,
  getChatProfile,
  getChatSessions,
  getChatSessionContext,
  renameChatSession,
  sendChatMessage,
  updateChatSession,
} from "./chat";

describe("chat api", () => {
  it("creates a chat session", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions", () => {
        return apiResponse({ id: 1, title: "Session A", reasoning_mode: "default" });
      }),
    );

    const result = await createChatSession({ title: "Session A" });

    expect(result.id).toBe(1);
    expect(result.reasoning_mode).toBe("default");
  });

  it("gets chat messages in order", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions/7/messages", () => {
        return apiResponse([
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
        ]);
      }),
    );

    const result = await getChatMessages(7);

    expect(result[0]?.id).toBe(1);
    expect(result[1]?.id).toBe(2);
  });

  it("sends a chat message", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages", () => {
        return apiResponse({
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
        });
      }),
    );

    await sendChatMessage(7, {
      content: "hello",
      client_request_id: "req-1",
    });
  });

  it("lists chat sessions", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions", () => {
        return apiResponse([{ id: 1, title: "Session A", reasoning_mode: "default" }]);
      }),
    );

    const result = await getChatSessions();

    expect(result).toHaveLength(1);
  });

  it("renames a chat session", async () => {
    overrideHandler(
      http.patch("*/api/chat/sessions/1", () => {
        return apiResponse({ id: 1, title: "Renamed Session", reasoning_mode: "default" });
      }),
    );

    const result = await renameChatSession(1, { title: "Renamed Session" });

    expect(result.title).toBe("Renamed Session");
  });

  it("updates the session reasoning mode", async () => {
    overrideHandler(
      http.patch("*/api/chat/sessions/1", () => {
        return apiResponse({ id: 1, title: "Session A", reasoning_mode: "on" });
      }),
    );

    const result = await updateChatSession(1, { reasoning_mode: "on" });

    expect(result.reasoning_mode).toBe("on");
  });

  it("deletes a failed chat message", async () => {
    overrideHandler(
      http.delete("*/api/chat/messages/10", () => {
        return apiResponse({ deleted: true });
      }),
    );

    await deleteChatMessage(10);
  });

  it("archives a chat attachment", async () => {
    overrideHandler(
      http.post("*/api/chat/messages/10/attachments/att-1/archive", () => {
        return apiResponse({
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
        });
      }),
    );

    await archiveChatMessageAttachment(10, "att-1", { document_revision_id: 99 });
  });

  it("deletes a chat session", async () => {
    overrideHandler(
      http.delete("*/api/chat/sessions/7", () => {
        return apiResponse({ deleted: true });
      }),
    );

    await deleteChatSession(7);
  });

  it("returns the chat profile with configured model and provider", async () => {
    overrideHandler(
      http.get("*/api/chat/profile", () => {
        return apiResponse({ configured: true, model: "gpt-5.4", provider: "openai" });
      }),
    );

    const result = await getChatProfile();

    expect(result.configured).toBe(true);
    expect(result.model).toBe("gpt-5.4");
    expect(result.provider).toBe("openai");
  });

  it("returns unconfigured profile when no model is set", async () => {
    overrideHandler(
      http.get("*/api/chat/profile", () => {
        return apiResponse({ configured: false, model: null, provider: "ollama" });
      }),
    );

    const result = await getChatProfile();

    expect(result.configured).toBe(false);
    expect(result.model).toBeNull();
  });

  it("fetches messages with beforeId and limit parameters", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions/99/messages", () => {
        return apiResponse([
          {
            id: 3,
            session_id: 99,
            role: "assistant",
            content: "older message",
            status: "succeeded",
            client_request_id: null,
            error_message: null,
            retry_of_message_id: null,
            reply_to_message_id: null,
            sources_json: null,
            created_at: "2026-01-15T10:00:00Z",
          },
        ]);
      }),
    );

    const result = await getChatMessagesWindow(99, { beforeId: 50, limit: 20 });

    expect(result).toHaveLength(1);
    const firstMessage = result[0];
    if (!firstMessage) throw new Error("Expected first message to exist");
    expect(firstMessage.id).toBe(3);
  });

  it("fetches messages with only limit when beforeId is omitted", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions/1/messages", () => {
        return apiResponse([]);
      }),
    );

    const result = await getChatMessagesWindow(1, { limit: 100 });

    expect(result).toHaveLength(0);
  });

  it("returns session context with attachments and latest message info", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions/7/context", () => {
        return apiResponse({
          session_id: 7,
          attachment_count: 2,
          attachments: [
            {
              attachment_id: "att-a",
              type: "document",
              name: "doc.pdf",
              mime_type: "application/pdf",
              size_bytes: 2048,
            },
          ],
          latest_assistant_message_id: 42,
          latest_assistant_sources: [
            { chunk_id: "1:0", section_title: "Intro", snippet: "intro text" },
          ],
        });
      }),
    );

    const result = await getChatSessionContext(7);

    expect(result.session_id).toBe(7);
    expect(result.attachment_count).toBe(2);
    expect(result.latest_assistant_message_id).toBe(42);
    expect(result.latest_assistant_sources).toHaveLength(1);
    expect(result.attachments).toHaveLength(1);
    const firstAttachment = result.attachments[0];
    if (!firstAttachment) throw new Error("Expected first attachment to exist");
    expect(firstAttachment.name).toBe("doc.pdf");
  });
});
