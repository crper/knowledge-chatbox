/**
 * @file 会话状态 Store 模块。
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

type SessionStatus = "bootstrapping" | "authenticated" | "anonymous" | "expired" | "degraded";

type SessionState = {
  status: SessionStatus;
  reset: () => void;
  setStatus: (status: SessionStatus) => void;
};

/**
 * 集中管理前端会话状态。
 */
export const useSessionStore = create<SessionState>()(
  devtools(
    (set) => ({
      status: "bootstrapping",
      reset: () => set({ status: "bootstrapping" }, false, "reset"),
      setStatus: (status) => set({ status }, false, `setStatus/${status}`),
    }),
    { name: "SessionStore" },
  ),
);
