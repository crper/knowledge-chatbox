/**
 * @file 聊天会话标题工具。
 */

export function resolveSessionTitle(title: string | null | undefined, fallbackTitle: string) {
  const normalizedTitle = title?.trim();
  return normalizedTitle ? normalizedTitle : fallbackTitle;
}
