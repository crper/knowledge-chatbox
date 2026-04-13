import type { StreamingRun } from "../utils/streaming-run";
import type { useChatSessionSubmitController } from "./use-chat-session-submit-controller";
import type { useChatStreamRun } from "./use-chat-stream-run";

type ChatSubmitController = ReturnType<typeof useChatSessionSubmitController>;
type ChatRunActions = ReturnType<typeof useChatStreamRun>;

export type ChatRuntime = {
  allRuns: StreamingRun[];
  abortSubmit: ChatSubmitController["abortSessionSubmit"];
  beginSubmit: ChatSubmitController["beginSessionSubmit"];
  finishSubmit: ChatSubmitController["finishSessionSubmit"];
  getSubmitState: ChatSubmitController["getSessionSubmitState"];
  isSubmitPending: ChatSubmitController["isSessionSubmitPending"];
  addSource: ChatRunActions["addSource"];
  appendDelta: ChatRunActions["appendDelta"];
  completeRun: ChatRunActions["completeRun"];
  failRun: ChatRunActions["failRun"];
  getAllRunsForSession: ChatRunActions["getAllRunsForSession"];
  getRun: ChatRunActions["getRun"];
  markToastShown: ChatRunActions["markToastShown"];
  pruneRuns: ChatRunActions["pruneRuns"];
  removeRun: ChatRunActions["removeRun"];
  sessionRunsById: Record<number, StreamingRun>;
  startRun: ChatRunActions["startRun"];
  stopRun: ChatRunActions["stopRun"];
};

export type ChatRuntimeActions = Omit<ChatRuntime, "allRuns" | "sessionRunsById">;

type CreateChatRuntimeInput = {
  runActions: ChatRunActions;
  submitController: ChatSubmitController;
};

/**
 * 将提交控制与流式运行 action 整形成统一的运行态动作集。
 */
export function createChatRuntime({
  runActions,
  submitController,
}: CreateChatRuntimeInput): ChatRuntimeActions {
  return {
    abortSubmit: submitController.abortSessionSubmit,
    beginSubmit: submitController.beginSessionSubmit,
    finishSubmit: submitController.finishSessionSubmit,
    getSubmitState: submitController.getSessionSubmitState,
    isSubmitPending: submitController.isSessionSubmitPending,
    addSource: runActions.addSource,
    appendDelta: runActions.appendDelta,
    completeRun: runActions.completeRun,
    failRun: runActions.failRun,
    getAllRunsForSession: runActions.getAllRunsForSession,
    getRun: runActions.getRun,
    markToastShown: runActions.markToastShown,
    pruneRuns: runActions.pruneRuns,
    removeRun: runActions.removeRun,
    startRun: runActions.startRun,
    stopRun: runActions.stopRun,
  };
}
