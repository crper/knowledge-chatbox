/**
 * @file 对话框基础 UI 组件模块。
 */

import * as React from "react";
import { cva } from "class-variance-authority";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const dialogOverlayVariants = cva(
  "fixed inset-0 isolate z-50 min-h-dvh bg-background/52 transition-opacity duration-100 supports-[-webkit-touch-callout:none]:absolute supports-backdrop-filter:backdrop-blur-sm data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
);

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(dialogOverlayVariants(), className)}
      {...props}
    />
  );
}

const dialogContentVariants = cva(
  "surface-floating fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl p-4 text-sm outline-none transition-[opacity,transform] duration-100 sm:max-w-sm data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
);

function DialogContent({
  className,
  children,
  closeLabel = "Close",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
  closeLabel?: string;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 overflow-y-auto p-4">
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(dialogContentVariants(), className)}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  aria-label={closeLabel}
                  className="absolute top-2 right-2"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <XIcon />
              <span className="sr-only">{closeLabel}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function DialogFooter({
  className,
  closeLabel = "Close",
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  closeLabel?: string;
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-[1.35rem] border-t border-border/56 bg-secondary/24 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {closeLabel}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-ui-title leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-ui-subtle text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogOverlayVariants,
  dialogContentVariants,
};
