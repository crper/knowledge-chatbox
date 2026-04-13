/**
 * @file 下拉菜单 Menu 基础 UI 组件模块。
 */

import * as React from "react";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@/lib/utils";
import {
  MENU_CONTENT_CLASS,
  menuItemVariants,
  type MenuItemVariantProps,
} from "@/lib/styles/menu-styles";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Positioner> & {
  portalled?: boolean;
  portalContainer?: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>["container"];
};

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  children,
  portalled = true,
  portalContainer,
  ...props
}: DropdownMenuContentProps) {
  const positioner = (
    <DropdownMenuPrimitive.Positioner
      align={align}
      className={cn("outline-hidden", className)}
      sideOffset={sideOffset}
      {...props}
    >
      <DropdownMenuPrimitive.Popup
        data-slot="dropdown-menu-content"
        className={cn(MENU_CONTENT_CLASS, "z-[60]")}
      >
        {children}
      </DropdownMenuPrimitive.Popup>
    </DropdownMenuPrimitive.Positioner>
  );

  return (
    <DropdownMenuPrimitive.Portal container={portalled ? undefined : portalContainer}>
      {positioner}
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> &
  MenuItemVariantProps & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      data-inset={inset}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(menuItemVariants({ variant }), className)}
      {...props}
    />
  );
}

function DropdownMenuLinkItem({
  className,
  closeOnClick = true,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.LinkItem> &
  MenuItemVariantProps & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.LinkItem
      closeOnClick={closeOnClick}
      data-inset={inset}
      data-slot="dropdown-menu-link-item"
      data-variant={variant}
      role="menuitem"
      className={cn(menuItemVariants({ variant }), className)}
      {...props}
    />
  );
}

const DROPDOWN_MENU_CHECK_ITEM_CLASS =
  "relative flex items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:*:text-accent-foreground data-inset:pl-7 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-inset={inset}
      data-slot="dropdown-menu-checkbox-item"
      className={cn(DROPDOWN_MENU_CHECK_ITEM_CLASS, className)}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  closeOnClick = true,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      closeOnClick={closeOnClick}
      data-inset={inset}
      data-slot="dropdown-menu-radio-item"
      className={cn(DROPDOWN_MENU_CHECK_ITEM_CLASS, className)}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-inset={inset}
      data-slot="dropdown-menu-label"
      className={cn(
        "px-2 py-1 text-xs font-medium tracking-[0.08em] text-muted-foreground data-inset:pl-7",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/70", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-[highlighted]/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuRoot>) {
  return <DropdownMenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      data-inset={inset}
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:*:text-accent-foreground data-inset:pl-7 data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: Omit<DropdownMenuContentProps, "portalled" | "portalContainer">) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner className={className} sideOffset={4} {...props}>
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(MENU_CONTENT_CLASS, "z-[60]")}
        >
          {children}
        </DropdownMenuPrimitive.Popup>
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  menuItemVariants as dropdownMenuItemVariants,
  MENU_CONTENT_CLASS as DROPDOWN_MENU_CONTENT_CLASS,
};
