/**
 * @file 测试用 HTTP helper。
 */

type ApiError = {
  code?: string;
  message?: string;
};

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

export function apiSuccessResponse(data: unknown, init?: ResponseInit): Response {
  return jsonResponse(
    {
      success: true,
      data,
      error: null,
    },
    init,
  );
}

export function apiErrorResponse(error: ApiError, init?: ResponseInit): Response {
  return jsonResponse(
    {
      success: false,
      data: null,
      error,
    },
    init,
  );
}

export function stubFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => unknown,
) {
  const fetchMock = vi.fn().mockImplementation(implementation);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}
