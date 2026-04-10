import { useCallback, useState } from "react";

export function useChatSessionSubmitController() {
  const [submitPendingSessionIds, setSubmitPendingSessionIds] = useState<Set<number>>(
    () => new Set(),
  );

  const beginSessionSubmit = useCallback((sessionId: number) => {
    let accepted = false;
    setSubmitPendingSessionIds((current) => {
      if (current.has(sessionId)) {
        return current;
      }
      accepted = true;
      const next = new Set(current);
      next.add(sessionId);
      return next;
    });
    return accepted;
  }, []);

  const finishSessionSubmit = useCallback((sessionId: number) => {
    setSubmitPendingSessionIds((current) => {
      if (!current.has(sessionId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
  }, []);

  const isSessionSubmitPending = useCallback(
    (sessionId: number | null) => sessionId !== null && submitPendingSessionIds.has(sessionId),
    [submitPendingSessionIds],
  );

  return {
    beginSessionSubmit,
    finishSessionSubmit,
    isSessionSubmitPending,
  };
}
