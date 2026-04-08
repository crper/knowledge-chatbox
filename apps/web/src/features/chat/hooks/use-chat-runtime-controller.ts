import { useMemo } from "react";

import { useChatSessionSubmitController } from "./use-chat-session-submit-controller";
import { useChatStreamRun } from "./use-chat-stream-run";

export function useChatRuntimeController() {
  const submitController = useChatSessionSubmitController();
  const streamRun = useChatStreamRun();

  return useMemo(
    () => ({
      ...submitController,
      streamRun,
    }),
    [streamRun, submitController],
  );
}
