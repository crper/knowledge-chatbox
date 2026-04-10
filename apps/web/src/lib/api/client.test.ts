import { i18n } from "@/i18n";
import { useSessionStore } from "@/lib/auth/session-store";
import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import {
  ApiRequestError,
  getApiErrorMessage,
  setResponseAuthTokenSnapshot,
  openapiRequestRequired,
} from "./client";

describe("api client", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("maps known api error codes to localized messages for UI display", () => {
    const error = new ApiRequestError("Invalid username or password.", {
      code: "invalid_credentials",
      status: 401,
    });

    expect(getApiErrorMessage(error)).toBe("用户名或密码不正确，请重试。");
  });

  it("preserves explicit payload messages returned by the backend", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "conflict",
              message: "用户名已存在",
            },
          },
          response: new Response(null, {
            status: 409,
            statusText: "Conflict",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      code: "conflict",
      message: "用户名已存在",
      status: 409,
    });
  });

  it("maps bare status codes to localized user-facing messages", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: null,
          response: new Response(null, {
            status: 403,
            statusText: "Forbidden",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      message: "当前账号没有执行此操作的权限。",
      status: 403,
    });
  });

  it("localizes authorization payload errors before surfacing them to the UI", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "unauthorized",
              message: "Authentication required.",
            },
          },
          response: new Response(null, {
            status: 401,
            statusText: "Unauthorized",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      message: "登录状态已失效，请重新登录。",
      status: 401,
    });
  });

  it("uses localized status messages when validation errors do not provide a display message", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            detail: [{ loc: ["body", "username"], msg: "Field required" }],
          },
          response: new Response(null, {
            status: 422,
            statusText: "Unprocessable Entity",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      message: "提交内容不符合要求，请检查后重试。",
      status: 422,
    });
  });

  it("preserves explicit payload messages for unknown error codes", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "provider_timeout",
              message: "上游模型响应超时，请稍后重试。",
            },
          },
          response: new Response(null, {
            status: 502,
            statusText: "Bad Gateway",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      code: "provider_timeout",
      message: "上游模型响应超时，请稍后重试。",
      status: 502,
    });
  });

  it("maps provider timeout errors to the active locale", async () => {
    const error = new ApiRequestError("上游模型响应超时，请稍后重试。", {
      code: "provider_timeout",
      status: 502,
    });

    expect(getApiErrorMessage(error)).toBe("服务响应超时，请稍后重试。");

    await i18n.changeLanguage("en");

    expect(getApiErrorMessage(error)).toBe(
      "The service took too long to respond. Try again later.",
    );
  });

  it("maps upload readiness errors to localized messages", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "embedding_not_configured",
              message: "Document upload requires a configured embedding provider.",
            },
          },
          response: new Response(null, {
            status: 409,
            statusText: "Conflict",
          }),
        }),
      ),
    ).rejects.toMatchObject({
      code: "embedding_not_configured",
      message: "上传前需要先配置检索 Provider。",
      status: 409,
    });
  });

  it("normalizes low-level network failures into a localized service error", async () => {
    await expect(
      openapiRequestRequired(Promise.reject(new TypeError("Failed to fetch"))),
    ).rejects.toMatchObject({
      message: "服务暂时不可用，请稍后重试。",
      status: 503,
    });
  });

  it("preserves contract errors when a successful envelope returns empty data", async () => {
    await expect(
      openapiRequestRequired(
        Promise.resolve({
          data: {
            success: true,
            data: null,
            error: null,
          },
          response: new Response(null, {
            status: 200,
            statusText: "OK",
          }),
        }),
      ),
    ).rejects.toThrow("API request returned empty data");
  });

  it("preserves non-network errors raised before a request envelope is available", async () => {
    const error = new Error("Unexpected parser failure");

    await expect(openapiRequestRequired(Promise.reject(error))).rejects.toBe(error);
  });

  it("maps abort failures to a localized timeout error", async () => {
    const error = new DOMException("The operation was aborted.", "AbortError");

    await expect(openapiRequestRequired(Promise.reject(error))).rejects.toMatchObject({
      message: "服务响应超时，请稍后重试。",
      status: 504,
    });
  });

  it("unwraps OpenAPI envelope payloads and preserves localized backend errors", async () => {
    const response = new Response(
      JSON.stringify({
        success: false,
        data: null,
        error: {
          code: "conflict",
          message: "用户名已存在",
        },
      }),
      {
        status: 409,
        statusText: "Conflict",
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "conflict",
              message: "用户名已存在",
            },
          },
          response,
        }),
      ),
    ).rejects.toMatchObject({
      code: "conflict",
      message: "用户名已存在",
      status: 409,
    });
  });

  it("marks the session as expired when the backend returns unauthorized", async () => {
    setAccessToken("current-token");
    const response = new Response(null, {
      status: 401,
      statusText: "Unauthorized",
    });
    setResponseAuthTokenSnapshot(response, "current-token");

    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "unauthorized",
              message: "登录状态已失效，请重新登录。",
            },
          },
          response,
        }),
      ),
    ).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });

    expect(useSessionStore.getState().status).toBe("expired");
  });

  it("ignores unauthorized responses that belong to a stale superseded token", async () => {
    setAccessToken("fresh-token");
    useSessionStore.getState().setStatus("authenticated");
    const response = new Response(null, {
      status: 401,
      statusText: "Unauthorized",
    });
    setResponseAuthTokenSnapshot(response, "stale-token");

    await expect(
      openapiRequestRequired(
        Promise.resolve({
          error: {
            success: false,
            data: null,
            error: {
              code: "unauthorized",
              message: "登录状态已失效，请重新登录。",
            },
          },
          response,
        }),
      ),
    ).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });

    expect(getAccessToken()).toBe("fresh-token");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });
});
