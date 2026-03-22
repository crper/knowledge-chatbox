/**
 * @file 应用壳层聊天布局辅助模块。
 */

/**
 * 定义桌面端聊天工作区左右侧栏列宽。
 */
export const CHAT_DESKTOP_PANEL_COLUMNS = {
  left: "minmax(16rem, 19rem)",
  right: "minmax(20rem, 24rem)",
} as const;

/**
 * 描述聊天工作区侧栏折叠状态。
 */
export type ChatWorkspacePanelsState = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

/**
 * 构建桌面端聊天工作区的三列模板。
 */
export function buildChatDesktopGridTemplate({
  leftCollapsed,
  rightCollapsed,
}: ChatWorkspacePanelsState) {
  const leftColumn = leftCollapsed ? "0rem" : CHAT_DESKTOP_PANEL_COLUMNS.left;
  const rightColumn = rightCollapsed ? "0rem" : CHAT_DESKTOP_PANEL_COLUMNS.right;

  return `${leftColumn} minmax(0, 1fr) ${rightColumn}`;
}
