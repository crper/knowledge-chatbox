/**
 * @file API 请求错误类型定义。
 */

export class ApiRequestError extends Error {
  code?: string;
  kind: "forbidden" | "network" | "server" | "timeout" | "unauthorized" | "unknown" | "validation";
  retryable: boolean;
  status: number;

  constructor(
    message: string,
    options: {
      code?: string;
      kind?: ApiRequestError["kind"];
      retryable?: boolean;
      status: number;
    },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = options.code;
    this.kind = options.kind ?? "unknown";
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}
