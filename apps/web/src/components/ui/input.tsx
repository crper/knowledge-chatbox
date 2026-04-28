/**
 * @file 输入基础 UI 组件模块。
 */

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";
import { INPUT_BASE_CLASS } from "@/lib/styles/input-base";

const INPUT_CLASS = cn(
  INPUT_BASE_CLASS,
  "h-8 w-full min-w-0 px-2.5 py-1 text-ui-body file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-ui-body file:font-medium file:text-foreground placeholder:text-muted-foreground/70 disabled:pointer-events-none",
);

function Input({ className, ...props }: React.ComponentProps<typeof InputPrimitive>) {
  return <InputPrimitive data-slot="input" className={cn(INPUT_CLASS, className)} {...props} />;
}

export { Input, INPUT_CLASS };
