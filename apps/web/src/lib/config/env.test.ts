import { normalizeApiBaseUrl } from "./env";

describe("env", () => {
  it("normalizes a same-origin /api base url to an empty origin prefix", async () => {
    expect(normalizeApiBaseUrl("/api")).toBe("");
  });

  it("strips a trailing /api suffix from an absolute api origin", async () => {
    expect(normalizeApiBaseUrl("http://localhost:8000/api")).toBe("http://localhost:8000");
  });
});
