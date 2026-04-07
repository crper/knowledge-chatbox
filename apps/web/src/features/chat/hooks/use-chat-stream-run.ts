/**
 * @file 聊天流式运行状态管理 Hook 模块。
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type { StreamingRun } from "../store/chat-stream-store";
import { MessageStatus } from "../constants";
import { createStreamRunCleanupScheduler } from "../utils/stream-run-cleanup";
import { getStreamRunsBySession } from "../utils/stream-run-query";

const STREAM_RUN_CLEANUP_DELAY_MS = 5 * 60 * 1000;

/**
 * 管理聊天流式运行的临时状态。
 */
export function useChatStreamRun() {
  const queryClient = useQueryClient();
  const cleanupScheduler = useMemo(
    () =>
      createStreamRunCleanupScheduler((runId) => {
        queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
      }, STREAM_RUN_CLEANUP_DELAY_MS),
    [queryClient],
  );

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
      queryClient.setQueryData(queryKeys.chat.streamRun(runId), {
        runId,
        sessionId,
        assistantMessageId,
        retryOfMessageId,
        userMessageId,
        userContent,
        content: "",
        sources: [],
        errorMessage: null,
        status: MessageStatus.PENDING,
        toastShown: false,
      } as StreamingRun);
    },
    [cleanupScheduler, queryClient],
  );

  const appendDelta = useCallback(
    (runId: number, delta: string) => {
      queryClient.setQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            content: current.content + delta,
            errorMessage: null,
            status: MessageStatus.STREAMING,
          };
        },
      );
    },
    [queryClient],
  );

  const addSource = useCallback(
    (runId: number, source: Record<string, unknown>) => {
      queryClient.setQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            sources: [...current.sources, source],
          };
        },
      );
    },
    [queryClient],
  );

  const completeRun = useCallback(
    (runId: number) => {
      queryClient.setQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
        (current) => {
          if (!current) return current;
          cleanupScheduler.schedule(runId);
          return {
            ...current,
            errorMessage: null,
            status: MessageStatus.SUCCEEDED,
          };
        },
      );
    },
    [cleanupScheduler, queryClient],
  );

  const failRun = useCallback(
    (runId: number, errorMessage: string | null = null) => {
      queryClient.setQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
        (current) => {
          if (!current) return current;
          cleanupScheduler.schedule(runId);
          return {
            ...current,
            errorMessage,
            status: MessageStatus.FAILED,
          };
        },
      );
    },
    [cleanupScheduler, queryClient],
  );

  const markToastShown = useCallback(
    (runId: number) => {
      queryClient.setQueryData<StreamingRun | undefined>(
        queryKeys.chat.streamRun(runId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            toastShown: true,
          };
        },
      );
    },
    [queryClient],
  );

  const removeRun = useCallback(
    (runId: number) => {
      cleanupScheduler.cancel(runId);
      queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
    },
    [cleanupScheduler, queryClient],
  );

  const pruneRuns = useCallback(
    (runIds: number[]) => {
      cleanupScheduler.cancelMany(runIds);
      runIds.forEach((runId) => {
        queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(runId) });
      });
    },
    [cleanupScheduler, queryClient],
  );

  const getRun = useCallback(
    (runId: number) => {
      return queryClient.getQueryData<StreamingRun>(queryKeys.chat.streamRun(runId));
    },
    [queryClient],
  );

  const getAllRunsForSession = useCallback(
    (sessionId: number) => {
      return Object.values(getStreamRunsBySession(queryClient, sessionId));
    },
    [queryClient],
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
      cleanupScheduler,
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
