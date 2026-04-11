/**
 * @file 聊天流式运行状态管理 Hook 模块。
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys, streamRunQueryOptions } from "@/lib/api/query-keys";
import {
  normalizeStreamingRun,
  type StreamingRun,
  type StreamingRunLike,
} from "../utils/streaming-run";
import { MessageStatus } from "../constants";
import { createStreamRunCleanupScheduler } from "../utils/stream-run-cleanup";
import { getStreamRunsBySession } from "../utils/stream-run-query";

const STREAM_RUN_CLEANUP_DELAY_MS = 5 * 60 * 1000;
const STREAM_DELTA_FLUSH_INTERVAL_MS = 16;

function updateStreamingRun(
  queryClient: ReturnType<typeof useQueryClient>,
  runId: number,
  updater: (current: StreamingRun) => StreamingRun,
) {
  queryClient.setQueryData<StreamingRun | undefined>(queryKeys.chat.streamRun(runId), (current) => {
    if (!current) return current;
    return updater(normalizeStreamingRun(current as StreamingRunLike));
  });
}

/**
 * 管理聊天流式运行的临时状态。
 */
export function useChatStreamRun() {
  const queryClient = useQueryClient();
  const pendingDeltaChunksRef = useRef<Map<number, string[]>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupScheduler = useMemo(
    () =>
      createStreamRunCleanupScheduler((runId) => {
        queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
      }, STREAM_RUN_CLEANUP_DELAY_MS),
    [queryClient],
  );

  const flushBufferedDeltas = useCallback(
    (targetRunId?: number) => {
      const flushRun = (runId: number, chunks: string[]) => {
        if (chunks.length === 0) return;
        const mergedDelta = chunks.join("");
        queryClient.setQueryData<StreamingRun | undefined>(
          queryKeys.chat.streamRun(runId),
          (current) => {
            if (!current) return current;
            const normalizedCurrent = normalizeStreamingRun(current as StreamingRunLike);
            return {
              ...normalizedCurrent,
              content: [...normalizedCurrent.content, mergedDelta],
              errorMessage: null,
              status: MessageStatus.STREAMING,
            };
          },
        );
      };

      if (typeof targetRunId === "number") {
        const chunks = pendingDeltaChunksRef.current.get(targetRunId);
        if (!chunks) return;
        pendingDeltaChunksRef.current.delete(targetRunId);
        flushRun(targetRunId, chunks);
        return;
      }

      const pendingEntries = Array.from(pendingDeltaChunksRef.current.entries());
      pendingDeltaChunksRef.current.clear();
      pendingEntries.forEach(([runId, chunks]) => {
        flushRun(runId, chunks);
      });
    },
    [queryClient],
  );

  const scheduleDeltaFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushBufferedDeltas();
    }, STREAM_DELTA_FLUSH_INTERVAL_MS);
  }, [flushBufferedDeltas]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushBufferedDeltas();
    };
  }, [flushBufferedDeltas]);

  const startRun = useCallback(
    ({
      runId,
      sessionId,
      assistantMessageId,
      retryOfMessageId = null,
      userMessageId,
      userContent,
    }: {
      runId: number;
      sessionId: number;
      assistantMessageId: number;
      retryOfMessageId?: number | null;
      userMessageId: number | null;
      userContent: string;
    }) => {
      cleanupScheduler.cancel(runId);
      pendingDeltaChunksRef.current.delete(runId);
      const initialData: StreamingRun = {
        runId,
        sessionId,
        assistantMessageId,
        retryOfMessageId,
        userMessageId,
        userContent,
        content: [],
        sources: [],
        errorMessage: null,
        status: MessageStatus.PENDING,
        toastShown: false,
      };
      queryClient.setQueryData(queryKeys.chat.streamRun(runId), initialData, {
        updatedAt: Date.now(),
      });
      void queryClient.ensureQueryData({
        ...streamRunQueryOptions(runId),
        initialData,
      });
    },
    [cleanupScheduler, queryClient],
  );

  const appendDelta = useCallback(
    (runId: number, delta: string) => {
      const existingChunks = pendingDeltaChunksRef.current.get(runId);
      if (existingChunks) {
        existingChunks.push(delta);
      } else {
        pendingDeltaChunksRef.current.set(runId, [delta]);
      }
      scheduleDeltaFlush();
    },
    [scheduleDeltaFlush],
  );

  const addSource = useCallback(
    (runId: number, source: Record<string, unknown>) => {
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => ({
        ...normalizedCurrent,
        sources: [...normalizedCurrent.sources, source],
      }));
    },
    [queryClient],
  );

  const completeRun = useCallback(
    (runId: number) => {
      flushBufferedDeltas(runId);
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => {
        cleanupScheduler.schedule(runId);
        return {
          ...normalizedCurrent,
          errorMessage: null,
          status: MessageStatus.SUCCEEDED,
        };
      });
    },
    [cleanupScheduler, flushBufferedDeltas, queryClient],
  );

  const failRun = useCallback(
    (runId: number, errorMessage: string | null = null) => {
      flushBufferedDeltas(runId);
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => {
        cleanupScheduler.schedule(runId);
        return {
          ...normalizedCurrent,
          errorMessage,
          status: MessageStatus.FAILED,
        };
      });
    },
    [cleanupScheduler, flushBufferedDeltas, queryClient],
  );

  const markToastShown = useCallback(
    (runId: number) => {
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => ({
        ...normalizedCurrent,
        toastShown: true,
      }));
    },
    [queryClient],
  );

  const removeRun = useCallback(
    (runId: number) => {
      pendingDeltaChunksRef.current.delete(runId);
      cleanupScheduler.cancel(runId);
      queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
    },
    [cleanupScheduler, queryClient],
  );

  const pruneRuns = useCallback(
    (runIds: number[]) => {
      runIds.forEach((runId) => {
        pendingDeltaChunksRef.current.delete(runId);
      });
      cleanupScheduler.cancelMany(runIds);
      runIds.forEach((runId) => {
        queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
      });
    },
    [cleanupScheduler, queryClient],
  );

  const getRun = useCallback(
    (runId: number) => {
      flushBufferedDeltas(runId);
      const run = queryClient.getQueryData<StreamingRunLike>(queryKeys.chat.streamRun(runId));
      if (!run) return undefined;
      return normalizeStreamingRun(run);
    },
    [flushBufferedDeltas, queryClient],
  );

  const getAllRunsForSession = useCallback(
    (sessionId: number) => {
      flushBufferedDeltas();
      return Object.values(getStreamRunsBySession(queryClient, sessionId));
    },
    [flushBufferedDeltas, queryClient],
  );

  return useMemo(
    () => ({
      appendDelta,
      addSource,
      completeRun,
      failRun,
      getAllRunsForSession,
      getRun,
      markToastShown,
      pruneRuns,
      removeRun,
      startRun,
    }),
    [
      appendDelta,
      addSource,
      completeRun,
      failRun,
      getAllRunsForSession,
      getRun,
      markToastShown,
      pruneRuns,
      removeRun,
      startRun,
    ],
  );
}
