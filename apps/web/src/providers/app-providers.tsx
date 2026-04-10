import type { PropsWithChildren, ReactNode } from "react";

import { Toaster as Sonner } from "@/components/ui/sonner";
import {
  ToastProvider,
  ToastViewport,
  ToastRoot,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
  useToastManager,
} from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";
import { StoreSyncProvider } from "./store-sync-provider";
import { ThemeProvider } from "./theme-provider";

function ToastRenderer() {
  const { toasts } = useToastManager();

  return (
    <ToastViewport>
      {toasts.map((toast: { id: string; title?: ReactNode; description?: ReactNode }) => (
        <ToastRoot key={toast.id} toast={toast}>
          <ToastContent>
            <div className="flex-1 min-w-0">
              {toast.title ? <ToastTitle>{toast.title}</ToastTitle> : null}
              {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
            </div>
            <ToastClose />
          </ToastContent>
        </ToastRoot>
      ))}
    </ToastViewport>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <QueryProvider>
            <StoreSyncProvider />
            <ToastProvider timeout={5000} limit={5}>
              {children}
              <ToastRenderer />
            </ToastProvider>
            <Sonner richColors position="top-right" />
          </QueryProvider>
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
