/**
 * @file 会话状态 Store 模块。
 */

import { create } from "zustand";

type SessionStatus = "bootstrapping" | "authenticated" | "anonymous" | "expired" | "degraded";

type SessionState = {
  status: SessionStatus;
  reset: () => void;
  setStatus: (status: SessionStatus) => void;
};

/**
 * 集中管理前端会话状态。
 */
export const useSessionStore = create<SessionState>((set) => ({
  status: "bootstrapping",
  reset: () =>
    set({
      status: "bootstrapping",
    }),
  setStatus: (status) => set({ status }),
}));
