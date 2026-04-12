import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

const contextMenuContentVariants = cva(
  "surface-floating z-50 min-w-32 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-xl p-1 text-popover-foreground shadow-lg transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
);

type ContextMenuContentProps = React.ComponentProps<typeof ContextMenuPrimitive.Positioner> & {
  children?: React.ReactNode;
  className?: string;
  portalled?: boolean;
};

function ContextMenuContent({
  className,
  children,
  portalled = true,
  ...props
}: ContextMenuContentProps) {
  const positioner = (
    <ContextMenuPrimitive.Positioner className={cn("outline-hidden", className)} {...props}>
      <ContextMenuPrimitive.Popup
        data-slot="context-menu-content"
        className={contextMenuContentVariants()}
      >
        {children}
      </ContextMenuPrimitive.Popup>
    </ContextMenuPrimitive.Positioner>
  );

  if (!portalled) {
    return positioner;
  }

  return <ContextMenuPrimitive.Portal>{positioner}</ContextMenuPrimitive.Portal>;
}

const contextMenuItemVariants = cva(
  "group/context-menu-item relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent/72 data-[highlighted]:text-accent-foreground data-[highlighted]:*:text-accent-foreground data-inset:pl-7 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "text-destructive data-[highlighted]:bg-destructive/12 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-destructive/18 *:[svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> &
  VariantProps<typeof contextMenuItemVariants> & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      data-inset={inset}
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(contextMenuItemVariants({ variant }), className)}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/70", className)}
      {...props}
    />
  );
}

function ContextMenuTrigger({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={className}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  contextMenuItemVariants,
  contextMenuContentVariants,
};
