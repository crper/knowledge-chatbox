/**
 * @file 数字输入基础 UI 组件模块。
 */

import * as React from "react";
import { cva } from "class-variance-authority";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";

import { cn } from "@/lib/utils";
import { inputBaseVariants } from "@/lib/styles/input-base";

const numberFieldInputVariants = cva(
  cn(
    inputBaseVariants(),
    "h-8 w-full min-w-0 px-2.5 py-1 text-base placeholder:text-muted-foreground disabled:pointer-events-none",
  ),
);

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
        className={cn(numberFieldInputVariants(), inputClassName)}
      />
    </NumberFieldPrimitive.Root>
  );
}

export { NumberField, numberFieldInputVariants };
