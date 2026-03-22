import { render, screen } from "@testing-library/react";

import { jsonResponse } from "@/test/http";
import { AppShell } from "./app";

describe("AppShell", () => {
  it("renders the shell fallback", () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { success: false, data: null, error: { code: "unauthorized" } },
            { status: 401 },
          ),
        ),
    );

    render(<AppShell />);

    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });
});
