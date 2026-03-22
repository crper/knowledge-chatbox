/**
 * @file 会话状态 Store 模块。
 */

import { create } from "zustand";

export type SessionStatus =
  | "bootstrapping"
  | "authenticated"
  | "anonymous"
  | "expired"
  | "degraded";

type SessionState = {
  redirectTo: string | null;
  status: SessionStatus;
  clearRedirectTo: () => void;
  reset: () => void;
  setRedirectTo: (value: string | null) => void;
  setStatus: (status: SessionStatus) => void;
};

/**
 * 集中管理前端会话状态。
 */
export const useSessionStore = create<SessionState>((set) => ({
  redirectTo: null,
  status: "bootstrapping",
  clearRedirectTo: () => set({ redirectTo: null }),
  reset: () =>
    set({
      redirectTo: null,
      status: "bootstrapping",
    }),
  setRedirectTo: (value) => set({ redirectTo: value }),
  setStatus: (status) => set({ status }),
}));
