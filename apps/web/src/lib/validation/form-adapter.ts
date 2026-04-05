import { z } from "zod";

import type { FormErrorDescriptor, FormValidationResult } from "@/lib/forms";
import { buildFormValidationResult, formError } from "@/lib/forms";

type FieldErrorItem = { message?: string; type?: string };

type LooseZodIssue = {
  code: string;
  path: (string | number)[];
  message: string;
  errors?: unknown[];
  unionErrors?: unknown[];
};

function zodIssueToFormError(
  issue: { message: string },
  translate?: (key: string) => string,
): FormErrorDescriptor {
  const message = issue.message;
  return formError(translate ? translate(message) : message);
}

function collectFieldErrors(
  issues: LooseZodIssue[],
  parentPath = "",
  translate?: (key: string) => string,
): Record<string, FormErrorDescriptor> {
  const errors: Record<string, FormErrorDescriptor> = {};

  for (const issue of issues) {
    if (issue.code === "invalid_union") {
      const nestedErrors = (issue.errors ?? issue.unionErrors ?? []) as Array<{
        issues: unknown[];
      }>;
      for (const unionIssue of nestedErrors) {
        if (
          unionIssue &&
          typeof unionIssue === "object" &&
          "issues" in unionIssue &&
          Array.isArray(unionIssue.issues)
        ) {
          Object.assign(
            errors,
            collectFieldErrors(unionIssue.issues as LooseZodIssue[], parentPath, translate),
          );
        }
      }
      continue;
    }

    const fieldPath = issue.path.length > 0 ? issue.path.map(String).join(".") : parentPath;

    if (fieldPath) {
      errors[fieldPath] = zodIssueToFormError(issue, translate);
    }
  }

  return errors;
}

export function zodToTanStackFormErrors<TFieldName extends string>(
  zodError: z.ZodError,
  options?: { formI18nKey?: string; translate?: (key: string) => string },
): FormValidationResult<TFieldName> | undefined {
  const fieldErrors = collectFieldErrors(
    zodError.issues as unknown as LooseZodIssue[],
    "",
    options?.translate,
  );

  const formErrorDescriptor = options?.formI18nKey ? formError(options.formI18nKey) : undefined;

  return buildFormValidationResult<TFieldName>(
    formErrorDescriptor,
    fieldErrors as Partial<Record<TFieldName, FormErrorDescriptor | undefined>>,
  );
}

export function createZodValidator<TInput, TFieldName extends string>(
  schema: z.ZodType<TInput>,
  options?: {
    formI18nKey?: string;
    translate?: (key: string) => string;
    transform?: (value: TInput) => TInput;
  },
) {
  return (values: unknown): FormValidationResult<TFieldName> | undefined => {
    const result = schema.safeParse(values);

    if (result.success) {
      return undefined;
    }

    return zodToTanStackFormErrors<TFieldName>(result.error, options);
  };
}

export function zodToFieldErrorItems(
  error: unknown,
  translate?: (key: string) => string,
): FieldErrorItem[] {
  if (!(error instanceof z.ZodError)) {
    if (
      error &&
      typeof error === "object" &&
      "issues" in error &&
      Array.isArray((error as { issues: unknown }).issues)
    ) {
      const zodLikeError = error as {
        issues: Array<{ message?: string; path?: (string | number)[] }>;
      };
      return zodLikeError.issues.flatMap((issue) =>
        issue.message ? [{ message: translate ? translate(issue.message) : issue.message }] : [],
      );
    }
    return [];
  }

  return error.issues.flatMap((issue) => [
    { message: translate ? translate(issue.message) : issue.message },
  ]);
}

export function adaptZodErrorForTanStack(_zodError: z.ZodError): {
  form?: { message: string };
  fields: Partial<Record<string, FieldErrorItem[]>>;
} {
  const fieldErrors: Partial<Record<string, FieldErrorItem[]>> = {};
  let formErrorMessage: string | null = null;

  for (const issue of _zodError.issues) {
    if (issue.path.length === 0) {
      formErrorMessage ??= issue.message;
      continue;
    }

    const fieldName = String(issue.path[0]);
    if (!fieldErrors[fieldName]) {
      fieldErrors[fieldName] = [];
    }

    fieldErrors[fieldName]!.push({
      message: issue.message,
      type: "ZodValidationError",
    });
  }

  return {
    form: formErrorMessage ? { message: formErrorMessage } : undefined,
    fields: fieldErrors,
  };
}
