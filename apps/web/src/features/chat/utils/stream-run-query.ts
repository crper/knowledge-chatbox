import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { normalizeStreamingRun, type StreamingRun, type StreamingRunLike } from "./streaming-run";

type StreamRunEntry = readonly [runId: number, run: StreamingRun];
export type StreamRunChange = {
  runId: number;
  run: StreamingRun | undefined;
};

export function isStreamRunQueryKey(
  queryKey: QueryKey,
): queryKey is ReturnType<typeof queryKeys.chat.streamRun> {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === "chat" &&
    queryKey[1] === "streamRun" &&
    typeof queryKey[2] === "number"
  );
}

export function getStreamRunIdFromQueryKey(queryKey: QueryKey): number | null {
  if (!isStreamRunQueryKey(queryKey)) {
    return null;
  }
  return queryKey[2];
}

export function getStreamRunEntries(queryClient: QueryClient): StreamRunEntry[] {
  return queryClient
    .getQueriesData<StreamingRunLike>({
      queryKey: queryKeys.chat.streamRuns,
    })
    .flatMap(([queryKey, run]) => {
      if (!run || !isStreamRunQueryKey(queryKey)) {
        return [];
      }

      return [[queryKey[2], normalizeStreamingRun(run)] as const];
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

export function subscribeToStreamRunChanges(
  queryClient: QueryClient,
  onChange: (change: StreamRunChange) => void,
) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (!event) return;
    const runId = getStreamRunIdFromQueryKey(event.query.queryKey);
    if (runId === null) return;
    const rawRun = event.query.state.data as StreamingRunLike | undefined;
    onChange({
      runId,
      run: event.type === "removed" || !rawRun ? undefined : normalizeStreamingRun(rawRun),
    });
  });
}
