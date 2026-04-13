/**
 * @file NavigationMenu 基础 UI 组件模块。
 */

import * as React from "react";
import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";

import { cn } from "@/lib/utils";

function NavigationMenu({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root
      className={cn("relative flex flex-col", className)}
      data-slot="navigation-menu"
      {...props}
    />
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      className={cn("flex flex-col gap-1", className)}
      data-slot="navigation-menu-list"
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      className={cn(className)}
      data-slot="navigation-menu-item"
      {...props}
    />
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      className={cn(className)}
      data-slot="navigation-menu-link"
      {...props}
    />
  );
}

type NavigationMenuContentProps = React.ComponentProps<typeof NavigationMenuPrimitive.Positioner>;

function NavigationMenuContent({ className, children, ...props }: NavigationMenuContentProps) {
  return (
    <NavigationMenuPrimitive.Portal>
      <NavigationMenuPrimitive.Positioner
        className={cn("z-[60]", className)}
        sideOffset={4}
        {...props}
      >
        <NavigationMenuPrimitive.Popup
          data-slot="navigation-menu-content"
          className="rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-md origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {children}
        </NavigationMenuPrimitive.Popup>
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPrimitive.Portal>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuContent,
};
