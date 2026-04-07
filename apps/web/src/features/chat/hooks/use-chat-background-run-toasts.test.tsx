import { render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/api/query-keys";
import { I18nProvider } from "@/providers/i18n-provider";
import { createTestQueryClient } from "@/test/query-client";
import { useChatStreamRun } from "./use-chat-stream-run";
import { useChatBackgroundRunToasts } from "./use-chat-background-run-toasts";

function BackgroundToastHost({
  resolvedActiveSessionId,
  sessions,
}: {
  resolvedActiveSessionId: number | null;
  sessions: Array<{ id: number; title: string | null }>;
}) {
  const streamRun = useChatStreamRun();
  useChatBackgroundRunToasts({
    resolvedActiveSessionId,
    sessions,
    sessionsPending: false,
    streamRun,
  });
  return null;
}

describe("useChatBackgroundRunToasts", () => {
  it("shows a background completion toast and removes the run once shown", async () => {
    const queryClient = createTestQueryClient();
    const successSpy = vi.spyOn(toast, "success");

    render(
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BackgroundToastHost
            resolvedActiveSessionId={1}
            sessions={[
              { id: 1, title: "Session A" },
              { id: 2, title: "Session B" },
            ]}
          />
        </QueryClientProvider>
      </I18nProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(205), {
      runId: 205,
      sessionId: 2,
      assistantMessageId: 24,
      userMessageId: 23,
      userContent: "hello",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith("Session B 已生成完成。");
      expect(queryClient.getQueryData(queryKeys.chat.streamRun(205))).toBeUndefined();
    });
  });
});
