import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { StreamingRun } from "../store/chat-stream-store";
import { getStreamRunEntries, subscribeToStreamRunChanges } from "../utils/stream-run-query";

export function useChatRuntimeState(sessionId: number | null) {
  const queryClient = useQueryClient();
  const [allRuns, setAllRuns] = useState<StreamingRun[]>([]);

  useEffect(() => {
    const syncRuns = () => {
      const nextRuns = getStreamRunEntries(queryClient)
        .map(([, run]) => run)
        .sort((left, right) => left.runId - right.runId);
      setAllRuns(nextRuns);
    };

    syncRuns();

    return subscribeToStreamRunChanges(queryClient, syncRuns);
  }, [queryClient]);

  const sessionRunsById = useMemo<Record<number, StreamingRun>>(() => {
    if (sessionId === null) {
      return {};
    }

    return Object.fromEntries(
      allRuns.filter((run) => run.sessionId === sessionId).map((run) => [run.runId, run]),
    );
  }, [allRuns, sessionId]);

  return {
    allRuns,
    sessionRunsById,
  };
}
