/**
 * @file 右键菜单 Menu 基础 UI 组件模块。
 */

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";
import {
  MENU_CONTENT_CLASS,
  menuItemVariants,
  type MenuItemVariantProps,
} from "@/lib/styles/menu-styles";

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

type ContextMenuContentProps = React.ComponentProps<typeof ContextMenuPrimitive.Positioner>;

function ContextMenuContent({ className, children, ...props }: ContextMenuContentProps) {
  const positioner = (
    <ContextMenuPrimitive.Positioner className={cn("outline-hidden", className)} {...props}>
      <ContextMenuPrimitive.Popup
        data-slot="context-menu-content"
        className={cn(MENU_CONTENT_CLASS, "z-50")}
      >
        {children}
      </ContextMenuPrimitive.Popup>
    </ContextMenuPrimitive.Positioner>
  );

  return <ContextMenuPrimitive.Portal>{positioner}</ContextMenuPrimitive.Portal>;
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> &
  MenuItemVariantProps & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      data-inset={inset}
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(menuItemVariants({ variant }), className)}
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
      className={cn(className)}
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
  menuItemVariants as contextMenuItemVariants,
  MENU_CONTENT_CLASS as CONTEXT_MENU_CONTENT_CLASS,
};
