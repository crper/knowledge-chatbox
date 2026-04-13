import type { PropsWithChildren } from "react";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";
import { useThemeEffect } from "./theme-provider";
import { useStoreSync } from "./store-sync-provider";

function AppProvidersInner({ children }: PropsWithChildren) {
  useThemeEffect();
  useStoreSync();

  return (
    <TooltipProvider delay={150}>
      <QueryProvider>
        {children}
        <Sonner richColors position="top-right" />
      </QueryProvider>
    </TooltipProvider>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <AppProvidersInner>{children}</AppProvidersInner>
    </I18nProvider>
  );
}
