import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getApiErrorMessage,
  parseEnvelopeFromRawBody,
  getResponseAuthTokenSnapshot,
  setResponseAuthTokenSnapshot,
  openapiRequestRequired,
} from "./client";
import { ApiRequestError } from "./api-request-error";

// 不 mock translateCommonErrorMessage，测试实际国际化行为

describe("getApiErrorMessage", () => {
  it("返回 ApiRequestError 的 message", () => {
    const error = new ApiRequestError("请求失败", { code: "test", status: 400 });
    expect(getApiErrorMessage(error)).toBe("请求失败");
  });

  it("返回非空 ApiRequestError message", () => {
    const error = new ApiRequestError("  有消息  ", { code: "test", status: 400 });
    expect(getApiErrorMessage(error)).toBe("有消息");
  });

  it("ApiRequestError message 为空时返回通用错误", () => {
    const error = new ApiRequestError("  ", { code: "test", status: 400 });
    expect(getApiErrorMessage(error)).toBe("请求失败，请稍后重试。");
  });

  it("返回普通 Error 的 message", () => {
    const error = new Error("网络错误");
    expect(getApiErrorMessage(error)).toBe("网络错误");
  });

  it("返回非空普通 Error message", () => {
    const error = new Error("  网络异常  ");
    expect(getApiErrorMessage(error)).toBe("网络异常");
  });

  it("其他类型错误返回通用错误消息", () => {
    expect(getApiErrorMessage("string error")).toBe("请求失败，请稍后重试。");
    expect(getApiErrorMessage(null)).toBe("请求失败，请稍后重试。");
    expect(getApiErrorMessage(undefined)).toBe("请求失败，请稍后重试。");
    expect(getApiErrorMessage(123)).toBe("请求失败，请稍后重试。");
  });
});

describe("parseEnvelopeFromRawBody", () => {
  it("解析成功响应返回 data", () => {
    const rawBody = JSON.stringify({ success: true, data: { id: 1 }, error: null });
    const response = new Response(rawBody, { status: 200 });
    const result = parseEnvelopeFromRawBody<{ id: number }>(rawBody, response);
    expect(result).toEqual({ id: 1 });
  });

  it("空字符串返回 null data 时抛出错误", () => {
    const rawBody = JSON.stringify({
      success: false,
      data: null,
      error: { code: "err", message: "失败" },
    });
    const response = new Response(rawBody, { status: 400 });
    expect(() => parseEnvelopeFromRawBody(rawBody, response)).toThrow(ApiRequestError);
  });

  it("JSON 解析失败抛出 ApiRequestError", () => {
    const rawBody = "not json";
    const response = new Response(rawBody, { status: 200 });
    expect(() => parseEnvelopeFromRawBody(rawBody, response)).toThrow(ApiRequestError);
  });

  it("success 为 false 时抛出 ApiRequestError", () => {
    const rawBody = JSON.stringify({
      success: false,
      data: null,
      error: { code: "unauthorized", message: "未授权" },
    });
    const response = new Response(rawBody, { status: 401 });
    expect(() => parseEnvelopeFromRawBody(rawBody, response)).toThrow(ApiRequestError);
  });
});

describe("getResponseAuthTokenSnapshot", () => {
  it("返回设置的 token 快照", () => {
    const response = new Response(null);
    setResponseAuthTokenSnapshot(response, "token-123");
    expect(getResponseAuthTokenSnapshot(response)).toBe("token-123");
  });

  it("未设置时返回 null", () => {
    const response = new Response(null);
    expect(getResponseAuthTokenSnapshot(response)).toBeNull();
  });

  it("设置 null token 时返回 null", () => {
    const response = new Response(null);
    setResponseAuthTokenSnapshot(response, null);
    expect(getResponseAuthTokenSnapshot(response)).toBeNull();
  });
});

describe("openapiRequestRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功时返回 data", async () => {
    const response = new Response(null, { status: 200 });
    const request = Promise.resolve({
      data: { success: true, data: { id: 1 }, error: null },
      error: null,
      response,
    });
    const result = await openapiRequestRequired<{ id: number }>(request);
    expect(result).toEqual({ id: 1 });
  });

  it("payload.success 为 false 时抛出 ApiRequestError", async () => {
    const response = new Response(null, { status: 400 });
    const request = Promise.resolve({
      data: { success: false, data: null, error: { code: "bad", message: "错误" } },
      error: null,
      response,
    });
    await expect(openapiRequestRequired(request)).rejects.toThrow(ApiRequestError);
  });

  it("请求抛出 TypeError 时转换为服务不可用错误", async () => {
    const request = Promise.reject(new TypeError("Failed to fetch"));
    await expect(openapiRequestRequired(request)).rejects.toMatchObject({
      message: expect.any(String),
    });
  });
});
