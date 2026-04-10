import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function ToastProvider({ ...props }: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />;
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]",
        className,
      )}
      data-slot="toast-viewport"
      {...props}
    />
  );
}

function ToastContent({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Content>) {
  return (
    <ToastPrimitive.Content
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg border border-border/70 bg-popover px-4 py-3 text-popover-foreground shadow-lg transition-[opacity,transform] duration-200 data-[ending-style]:translate-x-[calc(100%+1rem)] data-[ending-style]:opacity-0 data-[starting-style]:translate-x-[calc(100%+1rem)] data-[starting-style]:opacity-0",
        className,
      )}
      data-slot="toast-content"
      {...props}
    />
  );
}

function ToastRoot({ ...props }: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return <ToastPrimitive.Root data-slot="toast-root" {...props} />;
}

function ToastTitle({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      className={cn("text-sm font-semibold", className)}
      data-slot="toast-title"
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      data-slot="toast-description"
      {...props}
    />
  );
}

function ToastClose({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100",
        className,
      )}
      data-slot="toast-close"
      {...props}
    >
      <XIcon className="size-3.5" />
    </ToastPrimitive.Close>
  );
}

function ToastAction({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      data-slot="toast-action"
      {...props}
    />
  );
}

export {
  ToastProvider,
  ToastViewport,
  ToastRoot,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};

export const useToastManager = ToastPrimitive.useToastManager;
