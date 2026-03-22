/**
 * @file 聊天相关状态模块。
 */

import { create } from "zustand";

type StreamingRun = {
  runId: number;
  sessionId: number;
  assistantMessageId: number;
  retryOfMessageId?: number | null;
  userMessageId: number | null;
  userContent: string;
  content: string;
  sources: Array<Record<string, unknown>>;
  errorMessage: string | null;
  status: "pending" | "streaming" | "succeeded" | "failed";
  toastShown: boolean;
};

type ChatStreamState = {
  runsById: Record<number, StreamingRun>;
  startRun: (input: {
    runId: number;
    sessionId: number;
    assistantMessageId: number;
    retryOfMessageId?: number | null;
    userMessageId: number | null;
    userContent: string;
  }) => void;
  appendDelta: (runId: number, delta: string) => void;
  addSource: (runId: number, source: Record<string, unknown>) => void;
  completeRun: (runId: number) => void;
  failRun: (runId: number, errorMessage?: string | null) => void;
  markToastShown: (runId: number) => void;
  removeRun: (runId: number) => void;
  pruneRuns: (runIds: number[]) => void;
};

/**
 * 集中管理聊天流式响应状态。
 */
export const useChatStreamStore = create<ChatStreamState>((set) => ({
  runsById: {},
  startRun: ({
    runId,
    sessionId,
    assistantMessageId,
    retryOfMessageId = null,
    userMessageId,
    userContent,
  }) =>
    set((state) => ({
      runsById: {
        ...state.runsById,
        [runId]: {
          runId,
          sessionId,
          assistantMessageId,
          retryOfMessageId,
          userMessageId,
          userContent,
          content: "",
          sources: [],
          errorMessage: null,
          status: "pending",
          toastShown: false,
        },
      },
    })),
  appendDelta: (runId, delta) =>
    set((state) => {
      const run = state.runsById[runId];
      if (!run) {
        return state;
      }

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            content: `${run.content}${delta}`,
            errorMessage: null,
            status: "streaming",
          },
        },
      };
    }),
  addSource: (runId, source) =>
    set((state) => {
      const run = state.runsById[runId];
      if (!run) {
        return state;
      }

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            sources: [...run.sources, source],
          },
        },
      };
    }),
  completeRun: (runId) =>
    set((state) => {
      const run = state.runsById[runId];
      if (!run) {
        return state;
      }

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            errorMessage: null,
            status: "succeeded",
          },
        },
      };
    }),
  failRun: (runId, errorMessage = null) =>
    set((state) => {
      const run = state.runsById[runId];
      if (!run) {
        return state;
      }

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            errorMessage,
            status: "failed",
          },
        },
      };
    }),
  markToastShown: (runId) =>
    set((state) => {
      const run = state.runsById[runId];
      if (!run) {
        return state;
      }

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            toastShown: true,
          },
        },
      };
    }),
  removeRun: (runId) =>
    set((state) => {
      if (!(runId in state.runsById)) {
        return state;
      }

      const nextRunsById = { ...state.runsById };
      delete nextRunsById[runId];
      return { runsById: nextRunsById };
    }),
  pruneRuns: (runIds) =>
    set((state) => {
      if (runIds.length === 0) {
        return state;
      }

      const runIdSet = new Set(runIds);
      let changed = false;
      const nextRunsById: Record<number, StreamingRun> = {};
      Object.entries(state.runsById).forEach(([key, value]) => {
        const runId = Number(key);
        if (runIdSet.has(runId)) {
          changed = true;
          return;
        }
        nextRunsById[runId] = value;
      });

      return changed ? { runsById: nextRunsById } : state;
    }),
}));
