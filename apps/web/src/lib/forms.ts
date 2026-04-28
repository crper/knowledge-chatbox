import type { ZodType } from "zod";

export type FormErrorTranslator = (key: string, params?: Record<string, unknown>) => string;

function translate(t: FormErrorTranslator | undefined, message: string): string {
  return t ? t(message) : message;
}

function hasMessageProperty(value: object): value is { message: unknown } {
  return "message" in value;
}

function hasFormProperty(value: object): value is { form: unknown } {
  return "form" in value;
}

export function zodFieldErrors<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  values: Record<string, unknown>,
  formMessage?: string,
) {
  const result = schema.safeParse(values);
  if (result.success) return undefined;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  if (Object.keys(fields).length === 0) return undefined;
  return formMessage ? { fields, form: formMessage } : { fields };
}

export function translateFieldErrors(
  errors: unknown[],
  t?: FormErrorTranslator,
): Array<{ message: string }> {
  return errors
    .map((error) => {
      if (error && typeof error === "object" && hasMessageProperty(error)) {
        const message = String(error.message);
        return { message: translate(t, message) };
      }
      if (typeof error === "string") {
        return { message: translate(t, error) };
      }
      return null;
    })
    .filter((item): item is { message: string } => item !== null);
}

export function getFirstFormError(error: unknown, t?: FormErrorTranslator): string | null {
  if (error == null) return null;

  if (typeof error === "string") {
    return translate(t, error);
  }

  if (error && typeof error === "object") {
    if (hasMessageProperty(error) && typeof error.message === "string") {
      return translate(t, error.message);
    }

    if (hasFormProperty(error)) {
      return getFirstFormError(error.form, t);
    }
  }

  return null;
}

export function fieldError(message?: string): Array<{ message: string }> {
  return message ? [{ message }] : [];
}
