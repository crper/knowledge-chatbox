/**
 * @file TanStack Router chat session 路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { parseChatSessionId } from "@/features/chat/utils/chat-session-route";
import { ChatPageRoute } from "@/router/route-shells";

export const Route = createFileRoute("/_authed/chat/$sessionId")({
  beforeLoad: ({ params }) => {
    const sessionId = parseChatSessionId(params.sessionId);

    if (sessionId === null) {
      throw redirect({ replace: true, to: "/chat" });
    }
  },
  component: ChatPageRoute,
});
