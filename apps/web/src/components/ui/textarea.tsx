/**
 * @file Textarea基础 UI 组件模块。
 */

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 定义Textarea。
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[1.1rem] border border-border/72 bg-input/78 px-3 py-2.5 text-base shadow-[0_8px_20px_-22px_hsl(var(--shadow-color)/0.42)] transition-[background-color,border-color,box-shadow,color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 disabled:cursor-not-allowed disabled:bg-input/54 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
