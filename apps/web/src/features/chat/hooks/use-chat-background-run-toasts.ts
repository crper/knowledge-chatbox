import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { ChatRuntime } from "../runtime/chat-runtime";
import { resolveSessionTitle } from "../utils/session-title";
import type { StreamingRun } from "../utils/streaming-run";

type UseChatBackgroundRunToastsParams = {
  allRuns: StreamingRun[];
  resolvedActiveSessionId: number | null;
  sessions: Array<{ id: number; title: string | null }>;
  sessionsPending: boolean;
  runtime: Pick<ChatRuntime, "markToastShown" | "removeRun">;
};

export function useChatBackgroundRunToasts({
  allRuns,
  resolvedActiveSessionId,
  runtime,
  sessions,
  sessionsPending,
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
      runtime.markToastShown(run.runId);
      runtime.removeRun(run.runId);
    });
  }, [allRuns, resolvedActiveSessionId, runtime, sessions, sessionsPending, t]);
}
