import { z } from "zod";

import type { FormErrorDescriptor } from "@/lib/forms";
import { formError } from "@/lib/forms";

interface FormattedFieldError {
  field: string;
  message: string;
}

interface ZodFormattedErrors {
  formLevel: string | null;
  fields: FormattedFieldError[];
}

type LooseIssue = { code: string; message: string; [key: string]: unknown };

function formatSingleIssue(issue: LooseIssue, translate?: (key: string) => string): string {
  const rawMessage = issue.message;

  if (issue.code === "too_small") {
    const minimum = issue.minimum as number | undefined;
    const type = issue.type as string | undefined;
    if (type === "string" && minimum !== undefined) {
      return translate ? translate(rawMessage) : `输入内容至少需要 ${minimum} 个字符`;
    }
  }

  if (issue.code === "too_big") {
    const maximum = issue.maximum as number | undefined;
    const type = issue.type as string | undefined;
    if (type === "string" && maximum !== undefined) {
      return translate ? translate(rawMessage) : `输入内容不能超过 ${maximum} 个字符`;
    }
  }

  if (issue.code === "invalid_type") {
    const expected = issue.expected as string | undefined;
    const typeLabels: Record<string, string> = {
      string: "文本",
      number: "数字",
      boolean: "布尔值",
      object: "对象",
      array: "数组",
    };
    return translate
      ? translate(rawMessage)
      : `期望类型为 ${typeLabels[expected ?? ""] ?? expected}`;
  }

  return translate ? translate(rawMessage) : rawMessage;
}

export function formatZodError(
  zodError: z.ZodError,
  options?: { translate?: (key: string) => string },
): ZodFormattedErrors {
  const { translate } = options ?? {};
  const fields: FormattedFieldError[] = [];
  let formLevel: string | null = null;

  for (const issue of zodError.issues) {
    const looseIssue = issue as unknown as LooseIssue;
    if (issue.path.length === 0) {
      formLevel ??= formatSingleIssue(looseIssue, translate);
      continue;
    }

    const fieldName = issue.path.join(".");
    fields.push({
      field: fieldName,
      message: formatSingleIssue(looseIssue, translate),
    });
  }

  return { formLevel, fields };
}

export function zodErrorToFormDescriptors(
  zodError: z.ZodError,
  options?: { translate?: (key: string) => string; formI18nKey?: string },
): {
  form?: FormErrorDescriptor;
  fields: Partial<Record<string, FormErrorDescriptor>>;
} {
  const formatted = formatZodError(zodError, options);
  const fields: Partial<Record<string, FormErrorDescriptor>> = {};

  for (const { field, message } of formatted.fields) {
    fields[field] = formError(message);
  }

  return {
    form: formatted.formLevel
      ? formError(formatted.formLevel)
      : options?.formI18nKey
        ? formError(options.formI18nKey)
        : undefined,
    fields,
  };
}

export function getFirstZodErrorMessage(
  error: unknown,
  translate?: (key: string) => string,
): string | null {
  if (!(error instanceof z.ZodError)) {
    return null;
  }

  const formatted = formatZodError(error, { translate });
  if (formatted.formLevel) {
    return formatted.formLevel;
  }
  return formatted.fields[0]?.message ?? null;
}

export function getAllZodErrorMessages(
  error: unknown,
  translate?: (key: string) => string,
): string[] {
  if (!(error instanceof z.ZodError)) {
    return [];
  }

  const formatted = formatZodError(error, { translate });
  const messages: string[] = [];

  if (formatted.formLevel) {
    messages.push(formatted.formLevel);
  }

  for (const { message } of formatted.fields) {
    messages.push(message);
  }

  return messages;
}
