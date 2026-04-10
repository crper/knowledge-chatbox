import { useEffect, useRef } from "react";

import type { AppUser } from "@/lib/api/client";
import { clearPendingThemeSync, resolvePendingThemeSync } from "@/lib/config/theme-sync-storage";
import { useTheme } from "@/providers/theme-provider";

type UseThemeSyncServiceParams = {
  user: AppUser;
};

export function useThemeSyncService({ user }: UseThemeSyncServiceParams) {
  const { setTheme } = useTheme();
  const pendingThemeRef = useRef<AppUser["theme_preference"] | null>(null);
  const pendingThemeBaseRef = useRef<AppUser["theme_preference"] | null>(null);

  useEffect(() => {
    const pendingThemeSync = resolvePendingThemeSync(user.theme_preference);

    if (pendingThemeSync.shouldClearPendingTheme) {
      clearPendingThemeSync();
      pendingThemeRef.current = null;
      pendingThemeBaseRef.current = null;
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    if (pendingThemeRef.current !== pendingThemeSync.pendingTheme) {
      pendingThemeRef.current = pendingThemeSync.pendingTheme;
      pendingThemeBaseRef.current = user.theme_preference;
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    if (pendingThemeBaseRef.current === user.theme_preference) {
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    clearPendingThemeSync();
    pendingThemeRef.current = null;
    pendingThemeBaseRef.current = null;
    setTheme(user.theme_preference);
  }, [setTheme, user.theme_preference]);
}
