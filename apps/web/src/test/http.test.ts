import { afterEach, describe, expect, it } from "vite-plus/test";

import { apiErrorResponse, apiSuccessResponse, jsonResponse, stubFetch } from "./http";

describe("test/http", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates JSON responses with the default content type", async () => {
    const response = jsonResponse({ ok: true });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("wraps success payloads with the shared API envelope", async () => {
    const response = apiSuccessResponse({ id: 1 }, { status: 201 });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: 1 },
      error: null,
    });
  });

  it("wraps error payloads with the shared API envelope", async () => {
    const response = apiErrorResponse(
      { code: "unauthorized", message: "Authentication required." },
      { status: 401, statusText: "Unauthorized" },
    );

    expect(response.status).toBe(401);
    expect(response.statusText).toBe("Unauthorized");
    await expect(response.json()).resolves.toEqual({
      success: false,
      data: null,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });

  it("stubs global fetch with the provided implementation", async () => {
    const fetchMock = stubFetch((input) =>
      Promise.resolve(
        jsonResponse({
          url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        }),
      ),
    );

    const response = await fetch("https://example.com");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com");
    await expect(response.json()).resolves.toEqual({ url: "https://example.com" });
  });
});
