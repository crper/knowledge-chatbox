/**
 * @file 数字输入基础 UI 组件模块。
 */

import * as React from "react";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";

import { cn } from "@/lib/utils";

type NumberFieldProps = Omit<
  React.ComponentProps<typeof NumberFieldPrimitive.Root>,
  "inputRef" | "onValueChange" | "value"
> & {
  inputClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onValueChange?: (value: number | null) => void;
  value?: number | null;
};

function NumberField({
  "aria-invalid": ariaInvalid,
  className,
  inputClassName,
  inputRef,
  onValueChange,
  value,
  ...props
}: NumberFieldProps) {
  return (
    <NumberFieldPrimitive.Root
      className={cn("w-full", className)}
      data-slot="number-field"
      inputRef={inputRef}
      onValueChange={onValueChange}
      value={value}
      {...props}
    >
      <NumberFieldPrimitive.Input
        aria-invalid={ariaInvalid}
        data-slot="number-field-input"
        className={cn(
          "h-8 w-full min-w-0 rounded-xl border border-border/72 bg-input/78 px-2.5 py-1 text-base shadow-[0_8px_20px_-22px_hsl(var(--shadow-color)/0.42)] transition-[background-color,border-color,box-shadow,color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/54 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          inputClassName,
        )}
      />
    </NumberFieldPrimitive.Root>
  );
}

export { NumberField };
