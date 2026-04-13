/**
 * @file 聊天流式运行状态管理 Hook 模块。
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type { ChatSourceItem } from "../api/chat";
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

function hasTerminalState(run: StreamingRun): boolean {
  return run.terminalState !== null;
}

function updateStreamingRun(
  queryClient: QueryClient,
  runId: number,
  updater: (current: StreamingRun) => StreamingRun,
): void {
  queryClient.setQueryData<StreamingRun | undefined>(queryKeys.chat.streamRun(runId), (current) => {
    if (!current) return current;
    return updater(normalizeStreamingRun(current));
  });
}

/**
 * 管理聊天流式运行状态。
 *
 * 基于 TanStack Query 缓存管理每个流式运行的生命周期：
 * 创建 → 增量追加 → 终态（成功/失败/中止）→ 延迟清理。
 * 内置 delta 缓冲机制，将高频小 chunk 合并后批量写入，减少重渲染次数。
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
      const flushRun = (runId: number, chunks: string[] | undefined): void => {
        if (!chunks?.length) return;
        const mergedDelta = chunks.join("");
        queryClient.setQueryData<StreamingRun | undefined>(
          queryKeys.chat.streamRun(runId),
          (current) => {
            if (!current) return current;
            const normalizedCurrent = normalizeStreamingRun(current);
            if (hasTerminalState(normalizedCurrent)) {
              return normalizedCurrent;
            }
            return {
              ...normalizedCurrent,
              content: [...normalizedCurrent.content, mergedDelta],
              errorMessage: null,
              status: MessageStatus.STREAMING,
            };
          },
        );
        pendingDeltaChunksRef.current.delete(runId);
      };

      if (typeof targetRunId === "number") {
        const chunks = pendingDeltaChunksRef.current.get(targetRunId);
        if (!chunks?.length) return;
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

  const scheduleDeltaFlush = useCallback((): void => {
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
    }): void => {
      const existingRun = queryClient.getQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
      );
      if (existingRun !== undefined && existingRun.status !== MessageStatus.PENDING) {
        return;
      }
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
        suppressPersistedAssistantMessage: false,
        terminalState: null,
        toastShown: false,
      };
      queryClient.setQueryData(queryKeys.chat.streamRun(runId), initialData, {
        updatedAt: Date.now(),
      });
    },
    [cleanupScheduler, queryClient],
  );

  const appendDelta = useCallback(
    (runId: number, delta: string): void => {
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
    (runId: number, source: ChatSourceItem): void => {
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => {
        if (hasTerminalState(normalizedCurrent)) {
          return normalizedCurrent;
        }
        const sourceId = source.chunk_id;
        if (
          sourceId !== undefined &&
          normalizedCurrent.sources.some((s) => s.chunk_id === sourceId)
        ) {
          return normalizedCurrent;
        }
        return {
          ...normalizedCurrent,
          sources: [...normalizedCurrent.sources, source],
        };
      });
    },
    [queryClient],
  );

  const setRunTerminalState = useCallback(
    (
      runId: number,
      status: MessageStatus,
      terminalState: StreamingRun["terminalState"],
      errorMessage: string | null = null,
      extra: Partial<StreamingRun> = {},
    ): void => {
      flushBufferedDeltas(runId);
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => {
        if (hasTerminalState(normalizedCurrent)) {
          return normalizedCurrent;
        }
        cleanupScheduler.schedule(runId);
        return {
          ...normalizedCurrent,
          errorMessage,
          status,
          terminalState,
          ...extra,
        };
      });
    },
    [cleanupScheduler, flushBufferedDeltas, queryClient],
  );

  const completeRun = useCallback(
    (runId: number): void => {
      setRunTerminalState(runId, MessageStatus.SUCCEEDED, "succeeded");
    },
    [setRunTerminalState],
  );

  const failRun = useCallback(
    (runId: number, errorMessage: string | null = null): void => {
      setRunTerminalState(runId, MessageStatus.FAILED, "failed", errorMessage);
    },
    [setRunTerminalState],
  );

  const stopRun = useCallback(
    (runId: number, errorMessage: string | null = null): void => {
      setRunTerminalState(runId, MessageStatus.FAILED, "stopped", errorMessage, {
        suppressPersistedAssistantMessage: true,
      });
    },
    [setRunTerminalState],
  );

  const markToastShown = useCallback(
    (runId: number): void => {
      updateStreamingRun(queryClient, runId, (normalizedCurrent) => ({
        ...normalizedCurrent,
        toastShown: true,
      }));
    },
    [queryClient],
  );

  const removeRun = useCallback(
    (runId: number): void => {
      pendingDeltaChunksRef.current.delete(runId);
      cleanupScheduler.cancel(runId);
      queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
    },
    [cleanupScheduler, queryClient],
  );

  const pruneRuns = useCallback(
    (runIds: number[]): void => {
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
    (runId: number): StreamingRun | undefined => {
      flushBufferedDeltas(runId);
      const run = queryClient.getQueryData<StreamingRunLike>(queryKeys.chat.streamRun(runId));
      if (!run) return undefined;
      return normalizeStreamingRun(run);
    },
    [flushBufferedDeltas, queryClient],
  );

  const getAllRunsForSession = useCallback(
    (sessionId: number): StreamingRun[] => {
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
      stopRun,
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
      stopRun,
      startRun,
    ],
  );
}
