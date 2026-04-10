import { describe, expect, it } from "vite-plus/test";

import { resolveDevApiProxyTarget } from "./dev-proxy.ts";

describe("resolveDevApiProxyTarget", () => {
  it("defaults to localhost:8000 when API_PORT is unset", () => {
    expect(resolveDevApiProxyTarget({})).toBe("http://localhost:8000");
  });

  it("follows the current API_PORT override from just dev/reset-dev", () => {
    expect(resolveDevApiProxyTarget({ API_PORT: "18081" })).toBe("http://localhost:18081");
  });

  it("falls back to localhost:8000 when API_PORT is blank or invalid", () => {
    expect(resolveDevApiProxyTarget({ API_PORT: " " })).toBe("http://localhost:8000");
    expect(resolveDevApiProxyTarget({ API_PORT: "not-a-port" })).toBe("http://localhost:8000");
  });
});
