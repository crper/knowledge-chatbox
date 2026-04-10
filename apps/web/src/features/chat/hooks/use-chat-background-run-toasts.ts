import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resolveSessionTitle } from "../utils/session-title";
import type { StreamingRun } from "../utils/streaming-run";
import type { useChatStreamRun } from "./use-chat-stream-run";

type UseChatBackgroundRunToastsParams = {
  allRuns: StreamingRun[];
  resolvedActiveSessionId: number | null;
  sessions: Array<{ id: number; title: string | null }>;
  sessionsPending: boolean;
  streamRun: ReturnType<typeof useChatStreamRun>;
};

export function useChatBackgroundRunToasts({
  allRuns,
  resolvedActiveSessionId,
  sessions,
  sessionsPending,
  streamRun,
}: UseChatBackgroundRunToastsParams) {
  const { t } = useTranslation(["chat", "common"]);

  useEffect(() => {
    if (sessionsPending || sessions.length === 0) {
      return;
    }

    allRuns.forEach((run) => {
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
  }, [allRuns, resolvedActiveSessionId, sessions, sessionsPending, streamRun, t]);
}
