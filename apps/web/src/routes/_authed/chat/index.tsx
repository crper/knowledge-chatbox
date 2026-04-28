import { createFileRoute, redirect } from "@tanstack/react-router";

import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import {
  clearLastVisitedChatSessionId,
  readLastVisitedChatSessionId,
  resolveRestorableChatSessionId,
  writeLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const ChatPage = lazy(async () => ({
  default: (await import("@/pages/chat/chat-page")).ChatPage,
}));

export const Route = createFileRoute("/_authed/chat/")({
  loader: async ({ context }) => {
    const sessions = await context.queryClient.ensureQueryData(chatSessionsQueryOptions());
    const preferredSessionId = readLastVisitedChatSessionId();
    const nextSessionId = resolveRestorableChatSessionId(sessions, preferredSessionId);

    if (nextSessionId === null) {
      clearLastVisitedChatSessionId();
      return null;
    }

    if (preferredSessionId !== nextSessionId) {
      writeLastVisitedChatSessionId(nextSessionId);
    }

    throw redirect({
      replace: true,
      to: "/chat/$sessionId",
      params: { sessionId: String(nextSessionId) },
    });
  },
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <ChatPage />
    </Suspense>
  ),
  pendingComponent: LoadingState,
});
