/**
 * @file 输入基础 UI 组件模块。
 */

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 渲染输入控件。
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-xl border border-border/72 bg-input/78 px-2.5 py-1 text-base shadow-[0_8px_20px_-22px_hsl(var(--shadow-color)/0.42)] transition-[background-color,border-color,box-shadow,color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/54 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
