/**
 * @file 应用壳层聊天布局辅助模块。
 */

/**
 * 定义桌面端聊天工作区左右侧栏列宽。
 */
export const CHAT_DESKTOP_PANEL_COLUMNS = {
  rail: "4.75rem",
  left: "minmax(14.5rem, 17rem)",
  right: "minmax(17rem, 19rem)",
} as const;

/**
 * 描述聊天工作区侧栏折叠状态。
 */
export type ChatWorkspacePanelsState = {
  leftCollapsed: boolean;
};

/**
 * 构建桌面端聊天工作区的三列模板。
 */
export function buildChatDesktopGridTemplate({ leftCollapsed }: ChatWorkspacePanelsState) {
  const railColumn = CHAT_DESKTOP_PANEL_COLUMNS.rail;
  const leftColumn = leftCollapsed ? "0rem" : CHAT_DESKTOP_PANEL_COLUMNS.left;
  const rightColumn = CHAT_DESKTOP_PANEL_COLUMNS.right;

  return `${railColumn} ${leftColumn} minmax(0, 1fr) ${rightColumn}`;
}
