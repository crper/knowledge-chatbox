import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { StreamingRun } from "../utils/streaming-run";
import { getStreamRunEntries, subscribeToStreamRunChanges } from "../utils/stream-run-query";

export function useChatRuntimeState(sessionId: number | null) {
  const queryClient = useQueryClient();
  const [runsById, setRunsById] = useState<Record<number, StreamingRun>>({});

  useEffect(() => {
    const initialRuns = Object.fromEntries(getStreamRunEntries(queryClient));
    setRunsById(initialRuns);

    return subscribeToStreamRunChanges(queryClient, ({ run, runId }) => {
      setRunsById((current) => {
        if (!run) {
          if (!(runId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[runId];
          return next;
        }
        if (current[runId] === run) {
          return current;
        }
        return {
          ...current,
          [runId]: run,
        };
      });
    });
  }, [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps — 故意不依赖 sessionId；effect 管理全局 streamRun 状态，sessionId 过滤在下方 useMemo 中完成

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
