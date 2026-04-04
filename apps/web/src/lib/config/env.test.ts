import { normalizeApiBaseUrl } from "./env";

describe("env", () => {
  it("normalizes a same-origin /api base url to an empty origin prefix", async () => {
    expect(normalizeApiBaseUrl("/api")).toBe("");
  });

  it("strips a trailing /api suffix from an absolute api origin", async () => {
    expect(normalizeApiBaseUrl("http://localhost:8000/api")).toBe("http://localhost:8000");
  });

  it("prefers the dev proxy when the api base points at localhost", async () => {
    expect(normalizeApiBaseUrl("http://localhost:8000", { isDev: true })).toBe("");
  });

  it("prefers the dev proxy when the api base points at 127.0.0.1", async () => {
    expect(normalizeApiBaseUrl("http://127.0.0.1:8000", { isDev: true })).toBe("");
  });

  it("keeps explicit absolute origins outside dev mode", async () => {
    expect(normalizeApiBaseUrl("http://localhost:8000", { isDev: false })).toBe(
      "http://localhost:8000",
    );
  });
});
