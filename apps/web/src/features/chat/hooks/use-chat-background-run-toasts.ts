import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resolveSessionTitle } from "../utils/session-title";
import { getStreamRunEntries, subscribeToStreamRunChanges } from "../utils/stream-run-query";
import type { useChatStreamRun } from "./use-chat-stream-run";

type UseChatBackgroundRunToastsParams = {
  resolvedActiveSessionId: number | null;
  sessions: Array<{ id: number; title: string | null }>;
  sessionsPending: boolean;
  streamRun: ReturnType<typeof useChatStreamRun>;
};

export function useChatBackgroundRunToasts({
  resolvedActiveSessionId,
  sessions,
  sessionsPending,
  streamRun,
}: UseChatBackgroundRunToastsParams) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (sessionsPending || sessions.length === 0) {
      return;
    }

    const checkBackgroundRuns = () => {
      getStreamRunEntries(queryClient).forEach(([, run]) => {
        if (
          run.status !== "succeeded" ||
          run.toastShown ||
          run.sessionId === resolvedActiveSessionId
        ) {
          return;
        }

        const session = sessions.find((item) => item.id === run.sessionId);
        const title = resolveSessionTitle(session?.title, t("sessionTitleFallback"));
        toast.success(t("backgroundSessionCompletedToast", { title }));
        streamRun.markToastShown(run.runId);
        streamRun.removeRun(run.runId);
      });
    };

    checkBackgroundRuns();
    return subscribeToStreamRunChanges(queryClient, checkBackgroundRuns);
  }, [queryClient, resolvedActiveSessionId, sessions, sessionsPending, streamRun, t]);
}
