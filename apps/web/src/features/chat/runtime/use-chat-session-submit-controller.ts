import { useCallback, useRef, useState } from "react";

type SessionSubmitState = {
  clientRequestId: string | null;
  controller: AbortController;
};

/**
 * 管理聊天会话级提交锁。
 *
 * 跟踪每个会话的提交状态（pending / abort controller / client request ID），
 * 防止同一会话并发提交，并提供中止提交的能力。
 */
export function useChatSessionSubmitController() {
  const [submitPendingSessionIds, setSubmitPendingSessionIds] = useState<Set<number>>(
    () => new Set(),
  );
  const submitStatesRef = useRef(new Map<number, SessionSubmitState>());

  const beginSessionSubmit = useCallback(
    (
      sessionId: number,
      controller: AbortController,
      clientRequestId: string | null = null,
    ): boolean => {
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
      if (accepted) {
        submitStatesRef.current.set(sessionId, {
          clientRequestId,
          controller,
        });
      }
      return accepted;
    },
    [],
  );

  const finishSessionSubmit = useCallback((sessionId: number) => {
    submitStatesRef.current.delete(sessionId);
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

  const getSessionSubmitState = useCallback((sessionId: number | null) => {
    if (sessionId === null) {
      return null;
    }
    return submitStatesRef.current.get(sessionId) ?? null;
  }, []);

  const abortSessionSubmit = useCallback((sessionId: number | null) => {
    if (sessionId === null) {
      return false;
    }

    const submitState = submitStatesRef.current.get(sessionId);
    if (!submitState) {
      return false;
    }

    submitState.controller.abort();
    return true;
  }, []);

  return {
    abortSessionSubmit,
    beginSessionSubmit,
    finishSessionSubmit,
    getSessionSubmitState,
    isSessionSubmitPending,
  };
}
