import type { AppSettings } from "@/features/settings/api/settings";
import type { AppUser } from "@/lib/api/client";
import { server } from "./server";
import { createAuthHandlers } from "./handlers/auth";
import { createChatHandlers } from "./handlers/chat";
import { createKnowledgeHandlers } from "./handlers/knowledge";
import { createSettingsHandlers } from "./handlers/settings";
import { createUsersHandlers } from "./handlers/users";

export function overrideHandler(handler: Parameters<typeof server.use>[0]) {
  server.use(handler);
}

type CreateTestServerOptions = {
  user?: AppUser | null;
  authenticated?: boolean;
  settings?: Partial<AppSettings>;
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
    sources: unknown[] | null;
    created_at: string;
  }>;
  documents?: Array<{
    id: number;
    filename: string;
    status: string;
    created_at: string;
  }>;
  users?: AppUser[];
};

export function createTestServer(options: CreateTestServerOptions = {}) {
  const handlers = [
    ...createAuthHandlers({
      user: options.user,
      authenticated: options.authenticated,
    }),
    ...createSettingsHandlers({ settings: options.settings }),
    ...createChatHandlers({
      sessions: options.sessions,
      messages: options.messages,
    }),
    ...createKnowledgeHandlers({ documents: options.documents }),
    ...createUsersHandlers({ users: options.users }),
  ];

  server.resetHandlers(...handlers);
  return server;
}
