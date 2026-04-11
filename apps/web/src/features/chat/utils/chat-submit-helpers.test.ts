import { describe, expect, it } from "vite-plus/test";

import { ApiRequestError } from "@/lib/api/api-request-error";
import { resolveSubmitErrorMessage } from "./chat-submit-helpers";

describe("resolveSubmitErrorMessage", () => {
  it("falls back for normalized chat stream transport failures", () => {
    expect(resolveSubmitErrorMessage(new Error("Chat stream request failed."), "fallback")).toBe(
      "fallback",
    );
  });

  it("falls back for retryable server-side api errors", () => {
    expect(
      resolveSubmitErrorMessage(
        new ApiRequestError("Provider stream error.", {
          status: 502,
          kind: "server",
          retryable: true,
        }),
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("preserves user-facing business errors", () => {
    expect(resolveSubmitErrorMessage(new Error("用户名或密码错误"), "fallback")).toBe(
      "用户名或密码错误",
    );
  });
});
