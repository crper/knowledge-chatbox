/**
 * @file Textarea基础 UI 组件模块。
 */

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { inputBaseVariants } from "@/lib/styles/input-base";

const textareaVariants = cva(
  cn(
    inputBaseVariants(),
    "flex field-sizing-content min-h-16 w-full px-3 py-2.5 text-ui-body placeholder:text-muted-foreground/70",
  ),
);

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(textareaVariants(), className)} {...props} />;
}

export { Textarea, textareaVariants };
