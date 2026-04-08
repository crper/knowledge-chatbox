import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";
import { useChatRuntimeController } from "./use-chat-runtime-controller";

function RuntimeControllerHost() {
  const runtime = useChatRuntimeController();

  return (
    <div>
      <div data-testid="pending-session-1">{String(runtime.isSessionSubmitPending(1))}</div>
      <div data-testid="pending-session-2">{String(runtime.isSessionSubmitPending(2))}</div>
      <div data-testid="pending-ids">{runtime.submitPendingSessionIds.join(",")}</div>
      <button
        onClick={() => {
          runtime.beginSessionSubmit(1);
        }}
        type="button"
      >
        begin-1
      </button>
      <button
        onClick={() => {
          runtime.beginSessionSubmit(2);
        }}
        type="button"
      >
        begin-2
      </button>
      <button
        onClick={() => {
          runtime.finishSessionSubmit(1);
        }}
        type="button"
      >
        finish-1
      </button>
    </div>
  );
}

describe("useChatRuntimeController", () => {
  it("tracks submit locks per session without leaking to sibling sessions", () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeControllerHost />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "begin-1" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-ids")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "begin-2" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-ids")).toHaveTextContent("1,2");

    fireEvent.click(screen.getByRole("button", { name: "finish-1" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-ids")).toHaveTextContent("2");
  });
});
