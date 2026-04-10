/**
 * @file 抽屉基础 UI 组件模块。
 */

import * as React from "react";
import { Drawer as SheetPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

type SheetSide = "top" | "right" | "bottom" | "left";
const SheetSideContext = React.createContext<((side: SheetSide) => void) | null>(null);

const swipeDirectionBySide: Record<SheetSide, "up" | "right" | "down" | "left"> = {
  top: "up",
  right: "right",
  bottom: "down",
  left: "left",
};

function Sheet({
  side,
  disableSwipe,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root> & {
  side?: SheetSide;
  disableSwipe?: boolean;
}) {
  const [contentSide, setContentSide] = React.useState<SheetSide>("right");
  const resolvedSide = side ?? contentSide;

  return (
    <SheetSideContext.Provider value={setContentSide}>
      <SheetPrimitive.Root
        data-slot="sheet"
        swipeDirection={disableSwipe ? undefined : swipeDirectionBySide[resolvedSide]}
        {...props}
      />
    </SheetSideContext.Provider>
  );
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Backdrop>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-background/38 transition-opacity duration-100 supports-[-webkit-touch-callout:none]:absolute supports-backdrop-filter:backdrop-blur-md data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  closeLabel = "Close",
  overlayProps,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Popup> & {
  closeLabel?: string;
  overlayProps?: React.ComponentProps<typeof SheetPrimitive.Backdrop>;
  side?: SheetSide;
  showCloseButton?: boolean;
}) {
  const setSheetSide = React.useContext(SheetSideContext);

  React.useEffect(() => {
    setSheetSide?.(side);
  }, [setSheetSide, side]);

  return (
    <SheetPortal>
      <SheetOverlay {...overlayProps} />
      <SheetPrimitive.Viewport className="fixed inset-0 z-50 overflow-hidden">
        <SheetPrimitive.Popup
          data-side={side}
          data-slot="sheet-content"
          className={cn(
            "surface-floating fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm transition-[opacity,transform] duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[side=bottom]:data-[ending-style]:translate-y-10 data-[side=bottom]:data-[starting-style]:translate-y-10 data-[side=left]:data-[ending-style]:-translate-x-10 data-[side=left]:data-[starting-style]:-translate-x-10 data-[side=right]:data-[ending-style]:translate-x-10 data-[side=right]:data-[starting-style]:translate-x-10 data-[side=top]:data-[ending-style]:-translate-y-10 data-[side=top]:data-[starting-style]:-translate-y-10",
            className,
          )}
          {...props}
        >
          <SheetPrimitive.Content className="flex min-h-0 flex-1 flex-col gap-4">
            {children}
            {showCloseButton && (
              <SheetPrimitive.Close
                data-slot="sheet-close"
                render={
                  <Button
                    aria-label={closeLabel}
                    className="absolute top-3 right-3"
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <XIcon />
                <span className="sr-only">{closeLabel}</span>
              </SheetPrimitive.Close>
            )}
          </SheetPrimitive.Content>
        </SheetPrimitive.Popup>
      </SheetPrimitive.Viewport>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 border-b border-border/60 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
