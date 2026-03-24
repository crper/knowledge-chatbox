/**
 * @file 表单辅助模块。
 */

export type FormErrorDescriptor = {
  i18nKey: string;
  values?: Record<string, unknown>;
};

export type FormErrorTranslator = (key: string, params?: Record<string, unknown>) => string;

export type FormValidationResult<TField extends string> = {
  fields?: Partial<Record<TField, FormErrorDescriptor | undefined>>;
  form?: FormErrorDescriptor;
};

/**
 * 构造结构化表单错误，交给组件层按当前语言翻译。
 */
export function formError(i18nKey: string, values?: Record<string, unknown>): FormErrorDescriptor {
  return { i18nKey, values };
}

/**
 * 对字符串做 trim 后判空。
 */
export function trimmedRequired(
  value: string | null | undefined,
  i18nKey: string,
): FormErrorDescriptor | undefined {
  return normalizeText(value) ? undefined : formError(i18nKey);
}

/**
 * 校验最小长度。
 */
export function minLength(
  value: string | null | undefined,
  min: number,
  i18nKey: string,
): FormErrorDescriptor | undefined {
  return (value ?? "").length >= min ? undefined : formError(i18nKey, { min });
}

/**
 * 校验可选的绝对 URL，仅接受 http/https。
 */
export function isValidHttpUrl(
  value: string | null | undefined,
  i18nKey: string,
  options: { allowEmpty?: boolean } = {},
): FormErrorDescriptor | undefined {
  const { allowEmpty = true } = options;
  const normalized = normalizeText(value);

  if (!normalized) {
    return allowEmpty ? undefined : formError(i18nKey);
  }

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? undefined : formError(i18nKey);
  } catch {
    return formError(i18nKey);
  }
}

/**
 * 校验正整数范围。
 */
export function positiveIntegerInRange(
  value: number | string | null | undefined,
  min: number,
  max: number,
  i18nKey: string,
): FormErrorDescriptor | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? undefined
    : formError(i18nKey, { max, min });
}

/**
 * 把字段级问题收敛成 TanStack Form 可消费的结果对象。
 */
export function buildFormValidationResult<TField extends string>(
  form: FormErrorDescriptor | undefined,
  fields: Partial<Record<TField, FormErrorDescriptor | undefined>>,
): FormValidationResult<TField> | undefined {
  const definedFields = Object.fromEntries(
    Object.entries(fields).filter(([, issue]) => issue !== undefined),
  ) as Partial<Record<TField, FormErrorDescriptor | undefined>>;

  return Object.keys(definedFields).length > 0
    ? {
        fields: definedFields,
        ...(form ? { form } : {}),
      }
    : undefined;
}

/**
 * 返回第一条可展示的表单错误消息。
 */
export function getFirstFormError(errors: unknown[], translate?: FormErrorTranslator) {
  return getFormErrorMessages(errors, translate)[0] ?? null;
}

/**
 * 统一处理表单提交事件，避免浏览器默认提交并吞掉组件已自行展示的提交错误。
 */
export async function handleFormSubmitEvent(
  event: Pick<Event, "preventDefault">,
  submit: () => Promise<unknown>,
) {
  event.preventDefault();

  try {
    await submit();
  } catch {
    // 表单组件已通过 error map 或 notice 展示错误，这里避免未处理的 Promise 拒绝。
  }
}

/**
 * 提取可展示的错误消息列表。
 */
export function getFormErrorMessages(errors: unknown[], translate?: FormErrorTranslator) {
  return errors.flatMap((error) => collectErrorMessages(error, translate));
}

/**
 * 转为 FieldError 可直接消费的错误项。
 */
export function toFieldErrorItems(
  errors: unknown[],
  translate?: FormErrorTranslator,
  manualError?: string,
) {
  const messages = [...getFormErrorMessages(errors, translate), manualError].filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0,
  );

  return messages.map((message) => ({ message }));
}

function collectErrorMessages(error: unknown, translate?: FormErrorTranslator): string[] {
  if (typeof error === "string" && error.trim()) {
    return [error.trim()];
  }

  if (isFormErrorDescriptor(error)) {
    return [translate ? translate(error.i18nKey, error.values) : error.i18nKey];
  }

  if (Array.isArray(error)) {
    return error.flatMap((item) => collectErrorMessages(item, translate));
  }

  if (error && typeof error === "object") {
    const candidate = error as { form?: unknown; message?: unknown };
    const messages: string[] = [];

    if (candidate.message !== undefined) {
      messages.push(...collectErrorMessages(candidate.message, translate));
    }
    if (candidate.form !== undefined) {
      messages.push(...collectErrorMessages(candidate.form, translate));
    }

    return messages;
  }

  return [];
}

function isFormErrorDescriptor(error: unknown): error is FormErrorDescriptor {
  return (
    error !== null &&
    typeof error === "object" &&
    "i18nKey" in error &&
    typeof (error as { i18nKey?: unknown }).i18nKey === "string"
  );
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
