import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type { StreamingRun } from "../store/chat-stream-store";

type StreamRunEntry = readonly [runId: number, run: StreamingRun];

function isStreamRunQueryKey(
  queryKey: QueryKey,
): queryKey is ReturnType<typeof queryKeys.chat.streamRun> {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === "chat" &&
    queryKey[1] === "streamRun" &&
    typeof queryKey[2] === "number"
  );
}

export function getStreamRunEntries(queryClient: QueryClient): StreamRunEntry[] {
  return queryClient
    .getQueriesData<StreamingRun>({
      queryKey: queryKeys.chat.streamRuns,
    })
    .flatMap(([queryKey, run]) => {
      if (!run || !isStreamRunQueryKey(queryKey)) {
        return [];
      }

      return [[queryKey[2], run] as const];
    });
}

export function getStreamRunsBySession(queryClient: QueryClient, sessionId: number) {
  const runsById: Record<number, StreamingRun> = {};

  getStreamRunEntries(queryClient).forEach(([runId, run]) => {
    if (run.sessionId === sessionId) {
      runsById[runId] = run;
    }
  });

  return runsById;
}

export function findStreamRunByAssistantMessageId(
  queryClient: QueryClient,
  assistantMessageId: number,
  sessionId: number | null,
) {
  return getStreamRunEntries(queryClient).find(
    ([, run]) => run.assistantMessageId === assistantMessageId && run.sessionId === sessionId,
  )?.[1];
}

export function subscribeToStreamRunChanges(queryClient: QueryClient, onChange: () => void) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event && isStreamRunQueryKey(event.query.queryKey)) {
      onChange();
    }
  });
}
