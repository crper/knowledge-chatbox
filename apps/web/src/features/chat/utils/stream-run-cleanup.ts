type StreamRunCleanupScheduler = {
  cancel: (runId: number) => void;
  cancelMany: (runIds: number[]) => void;
  schedule: (runId: number) => void;
};

export function createStreamRunCleanupScheduler(
  removeRun: (runId: number) => void,
  delayMs: number,
): StreamRunCleanupScheduler {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const cancel = (runId: number) => {
    const timer = timers.get(runId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timers.delete(runId);
  };

  const cancelMany = (runIds: number[]) => {
    runIds.forEach(cancel);
  };

  const schedule = (runId: number) => {
    cancel(runId);

    const timer = setTimeout(() => {
      timers.delete(runId);
      removeRun(runId);
    }, delayMs);

    timers.set(runId, timer);
  };

  return {
    cancel,
    cancelMany,
    schedule,
  };
}
