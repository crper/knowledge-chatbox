/**
 * @file 前端模块。
 */

import type { LucideIcon } from "lucide-react";
import { FolderKanbanIcon, MessageSquareTextIcon, OrbitIcon } from "lucide-react";

type WorkspaceLabelKey = "navChat" | "navKnowledge" | "navGraph" | "navSettings" | "navUsers";

/**
 * 描述工作区Link的数据结构。
 */
type WorkspaceLink = {
  icon: LucideIcon;
  labelKey: WorkspaceLabelKey;
  to: string;
};

/**
 * 定义工作台主导航链接。
 */
export const WORKSPACE_LINKS: WorkspaceLink[] = [
  {
    icon: MessageSquareTextIcon,
    labelKey: "navChat",
    to: "/chat",
  },
  {
    icon: FolderKanbanIcon,
    labelKey: "navKnowledge",
    to: "/knowledge",
  },
  {
    icon: OrbitIcon,
    labelKey: "navGraph",
    to: "/graph",
  },
];

/**
 * 获取工作区标签键。
 */
export function getWorkspaceLabelKey(pathname: string): WorkspaceLabelKey {
  if (pathname.startsWith("/knowledge")) {
    return "navKnowledge";
  }
  if (pathname.startsWith("/graph")) {
    return "navGraph";
  }
  if (pathname.startsWith("/settings")) {
    return "navSettings";
  }
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/users")) {
    return "navUsers";
  }
  return "navChat";
}
