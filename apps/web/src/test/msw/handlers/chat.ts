import { http } from "msw";
import { buildChatSessionContext } from "@/test/chat";
import { apiResponse } from "./utils";

type ChatHandlersOptions = {
  sessions?: Array<{
    id: number;
    title: string | null;
    reasoning_mode: string;
  }>;
  messages?: Array<{
    id: number;
    session_id: number;
    role: string;
    content: string;
    status: string;
    client_request_id: string | null;
    error_message: string | null;
    retry_of_message_id: number | null;
    reply_to_message_id: number | null;
    sources_json: unknown[] | null;
    created_at: string;
  }>;
};

export function createChatHandlers(options: ChatHandlersOptions = {}) {
  const { sessions = [], messages = [] } = options;

  return [
    http.get("*/api/chat/sessions", () => {
      return apiResponse(sessions);
    }),

    http.post("*/api/chat/sessions", async ({ request }) => {
      const body = (await request.json()) as { title?: string | null };
      return apiResponse({
        id: sessions.length + 1,
        title: body?.title ?? "New Session",
        reasoning_mode: "default",
      });
    }),

    http.get("*/api/chat/sessions/:sessionId", ({ params }) => {
      const sessionId = Number(params.sessionId);
      const session = sessions.find((s) => s.id === sessionId);

      if (!session) {
        return apiResponse(null, { status: 404 });
      }

      return apiResponse(session);
    }),

    http.patch("*/api/chat/sessions/:sessionId", async ({ params, request }) => {
      const sessionId = Number(params.sessionId);
      const body = (await request.json()) as Record<string, unknown>;
      const session = sessions.find((s) => s.id === sessionId);

      if (!session) {
        return apiResponse(null, { status: 404 });
      }

      return apiResponse({ ...session, ...body });
    }),

    http.delete("*/api/chat/sessions/:sessionId", ({ params: _params }) => {
      return apiResponse({ deleted: true });
    }),

    http.get("*/api/chat/sessions/:sessionId/messages", ({ params }) => {
      const sessionId = Number(params.sessionId);
      const sessionMessages = messages.filter((m) => m.session_id === sessionId);
      return apiResponse(sessionMessages);
    }),

    http.get("*/api/chat/sessions/:sessionId/context", ({ params }) => {
      const sessionId = Number(params.sessionId);
      const sessionMessages = messages.filter((m) => m.session_id === sessionId);
      return apiResponse(
        buildChatSessionContext(
          sessionId,
          sessionMessages as Parameters<typeof buildChatSessionContext>[1],
        ),
      );
    }),

    http.post("*/api/chat/sessions/:sessionId/messages", async ({ params, request }) => {
      const sessionId = Number(params.sessionId);
      const body = (await request.json()) as { content?: string; client_request_id?: string };

      const userMessage = {
        id: messages.length + 1,
        session_id: sessionId,
        role: "user",
        content: body?.content ?? "",
        status: "succeeded",
        client_request_id: body?.client_request_id ?? null,
        error_message: null,
        retry_of_message_id: null,
        reply_to_message_id: null,
        sources_json: null,
        created_at: new Date().toISOString(),
      };

      const assistantMessage = {
        id: messages.length + 2,
        session_id: sessionId,
        role: "assistant",
        content: "This is a test response.",
        status: "succeeded",
        client_request_id: null,
        error_message: null,
        retry_of_message_id: null,
        reply_to_message_id: userMessage.id,
        sources_json: null,
        created_at: new Date().toISOString(),
      };

      return apiResponse({
        user_message: userMessage,
        assistant_message: assistantMessage,
      });
    }),

    http.delete("*/api/chat/messages/:messageId", ({ params: _params }) => {
      return apiResponse({ deleted: true });
    }),

    http.post(
      "*/api/chat/messages/:messageId/attachments/:attachmentId/archive",
      async ({ params, request: _request }) => {
        void (await _request.json());
        return apiResponse({
          id: Number(params.messageId),
          session_id: 1,
          role: "assistant",
          content: "Updated message",
          status: "succeeded",
          client_request_id: null,
          error_message: null,
          retry_of_message_id: null,
          reply_to_message_id: null,
          sources_json: null,
          created_at: new Date().toISOString(),
          attachments_json: [],
        });
      },
    ),
  ];
}
