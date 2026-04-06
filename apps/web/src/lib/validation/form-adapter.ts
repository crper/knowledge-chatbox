import { z } from "zod";

import type { FormErrorDescriptor, FormValidationResult } from "@/lib/forms";
import { buildFormValidationResult, formError } from "@/lib/forms";

type LooseZodIssue = {
  code: string;
  path: (string | number)[];
  message: string;
  errors?: unknown[];
  unionErrors?: unknown[];
};

type IssueFieldMapper<TFieldName extends string, TValues> = (
  issue: LooseZodIssue,
  values: TValues,
) => TFieldName | null;

function zodIssueToFormError(
  issue: { message: string },
  translate?: (key: string) => string,
): FormErrorDescriptor {
  const message = issue.message;
  return formError(translate ? translate(message) : message);
}

function collectFieldErrors<TValues = unknown>(
  issues: LooseZodIssue[],
  parentPath = "",
  translate?: (key: string) => string,
  values?: TValues,
  mapIssueToField?: IssueFieldMapper<string, TValues>,
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
            collectFieldErrors(
              unionIssue.issues as LooseZodIssue[],
              parentPath,
              translate,
              values,
              mapIssueToField,
            ),
          );
        }
      }
      continue;
    }

    const mappedFieldPath =
      values !== undefined && mapIssueToField ? mapIssueToField(issue, values) : null;
    const fieldPath =
      mappedFieldPath ?? (issue.path.length > 0 ? issue.path.map(String).join(".") : parentPath);

    if (fieldPath) {
      errors[fieldPath] = zodIssueToFormError(issue, translate);
    }
  }

  return errors;
}

export function zodToTanStackFormErrors<TFieldName extends string, TValues = unknown>(
  zodError: z.ZodError,
  options?: {
    formI18nKey?: string;
    mapIssueToField?: IssueFieldMapper<TFieldName, TValues>;
    translate?: (key: string) => string;
    values?: TValues;
  },
): FormValidationResult<TFieldName> | undefined {
  const fieldErrors = collectFieldErrors(
    zodError.issues as unknown as LooseZodIssue[],
    "",
    options?.translate,
    options?.values,
    options?.mapIssueToField as IssueFieldMapper<string, TValues> | undefined,
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
    mapIssueToField?: IssueFieldMapper<TFieldName, TInput>;
    translate?: (key: string) => string;
  },
) {
  return (values: unknown): FormValidationResult<TFieldName> | undefined => {
    const result = schema.safeParse(values);

    if (result.success) {
      return undefined;
    }

    return zodToTanStackFormErrors<TFieldName, TInput>(result.error, {
      ...options,
      values: values as TInput,
    });
  };
}
