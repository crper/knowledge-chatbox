/**
 * @file TanStack Router chat 列表入口。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { buildChatSessionPath } from "@/features/chat/utils/chat-session-route";
import {
  clearLastVisitedChatSessionId,
  readLastVisitedChatSessionId,
  resolveRestorableChatSessionId,
  writeLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import { ChatPageRoute } from "@/router/route-shells";

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
      to: buildChatSessionPath(nextSessionId),
    });
  },
  component: ChatPageRoute,
});
