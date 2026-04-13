import { useMemo, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { sortBy } from "es-toolkit";

import {
  createChatRuntime,
  type ChatRuntime,
  type ChatRuntimeActions,
} from "../runtime/chat-runtime";
import { useChatSessionSubmitController } from "../runtime/use-chat-session-submit-controller";
import { useChatStreamRun } from "../runtime/use-chat-stream-run";
import type { StreamingRun, StreamingRunLike } from "../utils/streaming-run";
import { normalizeStreamingRun } from "../utils/streaming-run";
import {
  getStreamRunIdFromQueryKey,
  isStreamRunQueryKey,
  subscribeToStreamRunChanges,
} from "../utils/stream-run-query";

type RawRunCacheEntry = readonly [runId: number, run: StreamingRunLike];

const EMPTY_RUNS: Record<number, StreamingRun> = {};

function getRawStreamRunEntries(queryClient: QueryClient): RawRunCacheEntry[] {
  return queryClient
    .getQueriesData<StreamingRunLike>({
      queryKey: ["chat", "streamRun"],
    })
    .flatMap(([queryKey, run]) => {
      if (!run || !isStreamRunQueryKey(queryKey)) {
        return [];
      }

      return [[getStreamRunIdFromQueryKey(queryKey)!, run] as const];
    });
}

function hasSameRawEntries(left: RawRunCacheEntry[], right: RawRunCacheEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      ([leftRunId, leftRun], index) =>
        leftRunId === right[index]?.[0] && Object.is(leftRun, right[index]?.[1]),
    )
  );
}

function buildRunsSnapshot(rawEntries: RawRunCacheEntry[]): Record<number, StreamingRun> {
  if (rawEntries.length === 0) {
    return EMPTY_RUNS;
  }

  return Object.fromEntries(rawEntries.map(([runId, run]) => [runId, normalizeStreamingRun(run)]));
}

/**
 * 暴露统一的聊天运行态 owner。
 *
 * 这层同时收口：
 * - 会话级提交锁（submit controller）
 * - query-backed 运行态缓存的读写
 */
export function useChatRuntime(sessionId: number | null = null): ChatRuntime {
  const queryClient = useQueryClient();
  const submitController = useChatSessionSubmitController();
  const runActions = useChatStreamRun();
  const runtimeActions = useMemo<ChatRuntimeActions>(
    () =>
      createChatRuntime({
        runActions,
        submitController,
      }),
    [runActions, submitController],
  );

  const store = useMemo(() => {
    let previousEntries: RawRunCacheEntry[] = [];
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

    const sessionEntries = sortBy(
      Object.entries(runsById).filter(([, run]) => run.sessionId === sessionId),
      [([, run]) => run.runId],
    );
    return Object.fromEntries(sessionEntries);
  }, [runsById, sessionId]);

  const allRuns = useMemo<StreamingRun[]>(() => {
    return sortBy(Object.values(runsById), [(run) => run.runId]);
  }, [runsById]);

  return useMemo(
    () => ({
      ...runtimeActions,
      allRuns,
      sessionRunsById,
    }),
    [allRuns, runtimeActions, sessionRunsById],
  );
}
