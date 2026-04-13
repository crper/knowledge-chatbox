/**
 * @file Textarea基础 UI 组件模块。
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { INPUT_BASE_CLASS } from "@/lib/styles/input-base";

const TEXTAREA_CLASS = cn(
  INPUT_BASE_CLASS,
  "flex field-sizing-content min-h-16 w-full px-3 py-2.5 text-ui-body placeholder:text-muted-foreground/70",
);

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(TEXTAREA_CLASS, className)} {...props} />;
}

export { Textarea, TEXTAREA_CLASS };
