/**
 * @file TanStack Router chat session 路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { buildChatSessionPath, parseChatSessionId } from "@/lib/routes";
import {
  clearLastVisitedChatSessionId,
  resolveRestorableChatSessionId,
  writeLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import { ChatPageRoute } from "@/router/route-shells";

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
        to: buildChatSessionPath(nextSessionId),
      });
    }

    writeLastVisitedChatSessionId(sessionId);
  },
  component: ChatPageRoute,
});
