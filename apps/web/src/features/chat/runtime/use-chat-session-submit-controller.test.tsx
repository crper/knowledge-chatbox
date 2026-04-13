import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";
import { useChatSessionSubmitController } from "./use-chat-session-submit-controller";

function SubmitControllerHost() {
  const runtime = useChatSessionSubmitController();

  return (
    <div>
      <div data-testid="pending-session-1">{String(runtime.isSessionSubmitPending(1))}</div>
      <div data-testid="pending-session-2">{String(runtime.isSessionSubmitPending(2))}</div>
      <button
        onClick={() => {
          runtime.beginSessionSubmit(1, new AbortController());
        }}
        type="button"
      >
        begin-1
      </button>
      <button
        onClick={() => {
          runtime.beginSessionSubmit(2, new AbortController());
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

describe("useChatSessionSubmitController", () => {
  it("tracks submit locks per session without leaking to sibling sessions", () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <SubmitControllerHost />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "begin-1" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "begin-2" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("true");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "finish-1" }));

    expect(screen.getByTestId("pending-session-1")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-session-2")).toHaveTextContent("true");
  });
});
