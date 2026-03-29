import { useCallback, useRef, useState } from "react";

export function useChatSessionSubmitController() {
  const submitPendingSessionIdsRef = useRef<Set<number>>(new Set());
  const [submitPendingSessionIds, setSubmitPendingSessionIds] = useState<number[]>([]);

  const beginSessionSubmit = useCallback((sessionId: number) => {
    if (submitPendingSessionIdsRef.current.has(sessionId)) {
      return false;
    }

    submitPendingSessionIdsRef.current.add(sessionId);
    setSubmitPendingSessionIds((current) =>
      current.includes(sessionId) ? current : [...current, sessionId],
    );
    return true;
  }, []);

  const finishSessionSubmit = useCallback((sessionId: number) => {
    if (!submitPendingSessionIdsRef.current.has(sessionId)) {
      return;
    }

    submitPendingSessionIdsRef.current.delete(sessionId);
    setSubmitPendingSessionIds((current) => current.filter((item) => item !== sessionId));
  }, []);

  const isSessionSubmitPending = useCallback(
    (sessionId: number | null) => sessionId !== null && submitPendingSessionIds.includes(sessionId),
    [submitPendingSessionIds],
  );

  return {
    beginSessionSubmit,
    finishSessionSubmit,
    isSessionSubmitPending,
    submitPendingSessionIds,
  };
}
