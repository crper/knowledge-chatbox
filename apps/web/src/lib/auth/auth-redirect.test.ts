import { buildLoginPath, sanitizeAuthRedirectPath } from "./auth-redirect";

describe("auth-redirect", () => {
  it("allows safe in-app targets", () => {
    expect(sanitizeAuthRedirectPath("/settings/providers")).toBe("/settings/providers");
  });

  it("rejects login route targets to prevent redirect loops", () => {
    expect(sanitizeAuthRedirectPath("/login")).toBeNull();
    expect(sanitizeAuthRedirectPath("/login?redirect=%2Fsettings%2Fproviders")).toBeNull();
    expect(sanitizeAuthRedirectPath("/login#anchor")).toBeNull();
  });

  it("falls back to /login when the redirect target points back to login", () => {
    expect(buildLoginPath("/login?redirect=%2Fsettings%2Fproviders")).toBe("/login");
  });
});
