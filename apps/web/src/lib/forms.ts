/**
 * @file 表单辅助模块。
 */

/**
 * 返回第一条可展示的表单错误消息。
 */
export function getFirstFormError(errors: unknown[]) {
  return getFormErrorMessages(errors)[0] ?? null;
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
export function getFormErrorMessages(errors: unknown[]) {
  return errors.flatMap(collectErrorMessages);
}

function collectErrorMessages(error: unknown): string[] {
  if (typeof error === "string" && error.trim()) {
    return [error.trim()];
  }

  if (Array.isArray(error)) {
    return error.flatMap(collectErrorMessages);
  }

  if (error && typeof error === "object") {
    const candidate = error as { form?: unknown; message?: unknown };
    const messages: string[] = [];

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      messages.push(candidate.message.trim());
    }
    if (typeof candidate.form === "string" && candidate.form.trim()) {
      messages.push(candidate.form.trim());
    }

    return messages;
  }

  return [];
}
