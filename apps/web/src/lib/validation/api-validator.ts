import type { ZodError, ZodSchema } from "zod";

export class ApiValidationError extends Error {
  readonly cause: ZodError;

  constructor(zodError: ZodError, message = "API 响应数据格式验证失败") {
    super(message);
    this.name = "ApiValidationError";
    this.cause = zodError;
  }
}

export function validateApiResponse<T>(
  data: unknown,
  schema: ZodSchema<T>,
  options?: { context?: string },
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const context = options?.context ? `[${options.context}] ` : "";
    throw new ApiValidationError(result.error, `${context}API 响应数据与预期格式不匹配`);
  }

  return result.data;
}

export function validateApiOptionalResponse<T>(data: unknown, schema: ZodSchema<T>): T | null {
  if (data === null || data === undefined) {
    return null;
  }

  return validateApiResponse(data, schema);
}

export function isApiValidationError(error: unknown): error is ApiValidationError {
  return error instanceof ApiValidationError;
}

export function safeValidateApiResponse<T>(
  data: unknown,
  schema: ZodSchema<T>,
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
