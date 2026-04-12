import { useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { StreamingRun, StreamingRunLike } from "../utils/streaming-run";
import { normalizeStreamingRun } from "../utils/streaming-run";
import {
  getStreamRunIdFromQueryKey,
  isStreamRunQueryKey,
  subscribeToStreamRunChanges,
} from "../utils/stream-run-query";

type RawStreamRunEntry = readonly [runId: number, run: StreamingRunLike];

const EMPTY_RUNS: Record<number, StreamingRun> = {};

function getRawStreamRunEntries(
  queryClient: ReturnType<typeof useQueryClient>,
): RawStreamRunEntry[] {
  return queryClient
    .getQueriesData<StreamingRunLike>({
      queryKey: ["chat", "streamRun"],
    })
    .flatMap(([queryKey, run]) => {
      if (!run || !isStreamRunQueryKey(queryKey)) {
        return [];
      }

      return [[getStreamRunIdFromQueryKey(queryKey) ?? queryKey[2], run] as const];
    });
}

function hasSameRawEntries(left: RawStreamRunEntry[], right: RawStreamRunEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      ([leftRunId, leftRun], index) =>
        leftRunId === right[index]?.[0] && Object.is(leftRun, right[index]?.[1]),
    )
  );
}

function buildRunsSnapshot(rawEntries: RawStreamRunEntry[]): Record<number, StreamingRun> {
  if (rawEntries.length === 0) {
    return EMPTY_RUNS;
  }

  return Object.fromEntries(rawEntries.map(([runId, run]) => [runId, normalizeStreamingRun(run)]));
}

/**
 * 管理聊天流式运行的运行时状态订阅。
 * @param sessionId - 当前会话 ID，为 null 时不订阅特定会话
 * @returns 包含所有运行和会话运行的对象
 */
export function useChatRuntimeState(sessionId: number | null) {
  const queryClient = useQueryClient();
  const store = useMemo(() => {
    let previousEntries: RawStreamRunEntry[] = [];
    let previousSnapshot: Record<number, StreamingRun> = EMPTY_RUNS;

    const getSnapshot = (): Record<number, StreamingRun> => {
      const nextEntries = getRawStreamRunEntries(queryClient);
      if (hasSameRawEntries(previousEntries, nextEntries)) {
        return previousSnapshot;
      }

      previousEntries = nextEntries;
      previousSnapshot = buildRunsSnapshot(nextEntries);
      return previousSnapshot;
    };

    return {
      getSnapshot,
      subscribe: (onStoreChange: () => void) =>
        subscribeToStreamRunChanges(queryClient, () => {
          onStoreChange();
        }),
    };
  }, [queryClient]);

  const runsById = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY_RUNS);

  const sessionRunsById = useMemo<Record<number, StreamingRun>>(() => {
    if (sessionId === null) {
      return {};
    }

    const sessionEntries = Object.entries(runsById)
      .filter(([, run]) => run.sessionId === sessionId)
      .sort(([, left], [, right]) => left.runId - right.runId);
    return Object.fromEntries(sessionEntries);
  }, [runsById, sessionId]);

  const allRuns = useMemo<StreamingRun[]>(() => {
    return Object.values(runsById).sort((left, right) => left.runId - right.runId);
  }, [runsById]);

  return {
    allRuns,
    sessionRunsById,
  };
}
