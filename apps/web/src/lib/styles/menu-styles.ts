/**
 * @file 菜单组件共享样式定义。
 * dropdown-menu 和 context-menu 共用的样式常量和 cva 变体。
 */

import { cva, type VariantProps } from "class-variance-authority";

export const MENU_CONTENT_CLASS =
  "surface-floating min-w-32 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-xl p-1 text-popover-foreground shadow-lg transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";

export const menuItemVariants = cva(
  "group/menu-item relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent/72 data-[highlighted]:text-accent-foreground data-[highlighted]:*:text-accent-foreground data-inset:pl-7 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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

export type MenuItemVariantProps = VariantProps<typeof menuItemVariants>;
