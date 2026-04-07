import { createStreamRunCleanupScheduler } from "./stream-run-cleanup";

describe("stream-run-cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a deferred cleanup for a run id", () => {
    const removeRun = vi.fn();
    const scheduler = createStreamRunCleanupScheduler(removeRun, 1000);

    scheduler.schedule(11);
    vi.advanceTimersByTime(999);
    expect(removeRun).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(removeRun).toHaveBeenCalledWith(11);
  });

  it("replaces an existing timer when the same run is scheduled again", () => {
    const removeRun = vi.fn();
    const scheduler = createStreamRunCleanupScheduler(removeRun, 1000);

    scheduler.schedule(11);
    vi.advanceTimersByTime(600);
    scheduler.schedule(11);
    vi.advanceTimersByTime(600);

    expect(removeRun).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(removeRun).toHaveBeenCalledTimes(1);
    expect(removeRun).toHaveBeenCalledWith(11);
  });

  it("cancels cleanup for removed runs", () => {
    const removeRun = vi.fn();
    const scheduler = createStreamRunCleanupScheduler(removeRun, 1000);

    scheduler.schedule(11);
    scheduler.cancel(11);
    vi.runAllTimers();

    expect(removeRun).not.toHaveBeenCalled();
  });

  it("cancels cleanup for multiple pruned runs", () => {
    const removeRun = vi.fn();
    const scheduler = createStreamRunCleanupScheduler(removeRun, 1000);

    scheduler.schedule(11);
    scheduler.schedule(12);
    scheduler.cancelMany([11, 12]);
    vi.runAllTimers();

    expect(removeRun).not.toHaveBeenCalled();
  });
});
