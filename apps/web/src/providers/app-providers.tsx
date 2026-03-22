/**
 * @file Apps Provider 模块。
 */

import type { PropsWithChildren } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";
import { StoreSyncProvider } from "./store-sync-provider";
import { ThemeProvider } from "./theme-provider";

/**
 * 组装应用级 Provider 链路。
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <QueryProvider>
            <StoreSyncProvider />
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
