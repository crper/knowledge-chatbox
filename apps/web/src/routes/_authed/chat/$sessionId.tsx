import { createFileRoute, redirect } from "@tanstack/react-router";

import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { parseChatSessionId } from "@/lib/routes";
import {
  clearLastVisitedChatSessionId,
  resolveRestorableChatSessionId,
  writeLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const ChatPage = lazy(async () => ({
  default: (await import("@/pages/chat/chat-page")).ChatPage,
}));

export const Route = createFileRoute("/_authed/chat/$sessionId")({
  beforeLoad: async ({ context, params }) => {
    const sessionId = parseChatSessionId(params.sessionId);

    if (sessionId === null) {
      throw redirect({ replace: true, to: "/chat" });
    }

    const sessions = await context.queryClient.ensureQueryData(chatSessionsQueryOptions());
    const nextSessionId = resolveRestorableChatSessionId(sessions, sessionId);

    if (nextSessionId === null) {
      clearLastVisitedChatSessionId();
      throw redirect({ replace: true, to: "/chat" });
    }

    if (nextSessionId !== sessionId) {
      writeLastVisitedChatSessionId(nextSessionId);
      throw redirect({
        replace: true,
        to: "/chat/$sessionId",
        params: { sessionId: String(nextSessionId) },
      });
    }

    writeLastVisitedChatSessionId(sessionId);
  },
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <ChatPage />
    </Suspense>
  ),
  pendingComponent: LoadingState,
});
