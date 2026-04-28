/**
 * @file 数字输入基础 UI 组件模块。
 */

import * as React from "react";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";

import { cn } from "@/lib/utils";
import { INPUT_BASE_CLASS } from "@/lib/styles/input-base";

const NUMBER_FIELD_INPUT_CLASS = cn(
  INPUT_BASE_CLASS,
  "h-8 w-full min-w-0 px-2.5 py-1 text-base placeholder:text-muted-foreground disabled:pointer-events-none",
);

/**
 * NumberField Props 类型。
 * Omit onValueChange 是因为 Base UI 原生签名包含内部状态参数，
 * 此处简化为 (value: number | null) => void 以降低使用复杂度。
 * 需关注库升级时原生签名变更导致的类型漂移。
 */
type NumberFieldProps = Omit<
  React.ComponentProps<typeof NumberFieldPrimitive.Root>,
  "onValueChange"
> & {
  inputClassName?: string;
  onValueChange?: (value: number | null) => void;
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
        className={cn(NUMBER_FIELD_INPUT_CLASS, inputClassName)}
      />
    </NumberFieldPrimitive.Root>
  );
}

export { NumberField, NUMBER_FIELD_INPUT_CLASS };
