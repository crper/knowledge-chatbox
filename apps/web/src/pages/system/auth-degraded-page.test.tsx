import { fireEvent, render, screen } from "@testing-library/react";

import { useSessionStore } from "@/lib/auth/session-store";
import { AppProviders } from "@/providers/app-providers";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";

describe("AuthDegradedPage", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setStatus("degraded");
  });

  it("clears degraded session state and reloads the login page when leaving the broken auth flow", () => {
    const onBackToLogin = vi.fn();

    render(
      <AppProviders>
        <AuthDegradedPage onBackToLogin={onBackToLogin} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "返回登录页" }));

    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });
});
