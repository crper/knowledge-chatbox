/**
 * @file 文本显示基础 UI 组件模块。
 * @description 提供带溢出处理、多行截断等功能的文本组件。
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 单行文本溢出截断组件。
 */
function TextTruncate({
  children,
  className,
  as: Component = "span",
  title,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  as?: React.ElementType;
  title?: string;
}) {
  return (
    <Component
      className={cn("truncate", className)}
      title={title ?? (typeof children === "string" ? children : undefined)}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * 多行文本溢出截断组件。
 */
function TextLineClamp({
  children,
  className,
  lines = 2,
  as: Component = "span",
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  lines?: 1 | 2 | 3 | 4 | 5;
  as?: React.ElementType;
}) {
  const lineClampClass = {
    1: "line-clamp-1",
    2: "line-clamp-2",
    3: "line-clamp-3",
    4: "line-clamp-4",
    5: "line-clamp-5",
  }[lines];

  return (
    <Component className={cn(lineClampClass, className)} {...props}>
      {children}
    </Component>
  );
}

/**
 * 可换行长文本组件（自动断词）。
 */
function TextBreak({
  children,
  className,
  as: Component = "span",
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  as?: React.ElementType;
}) {
  return (
    <Component className={cn("break-words [overflow-wrap:anywhere]", className)} {...props}>
      {children}
    </Component>
  );
}

/**
 * 带提示的文本组件（溢出时显示完整内容）。
 */
function TextWithTooltip({
  children,
  className,
  maxWidth,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  maxWidth?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (element) {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    }
  }, [children]);

  return (
    <span
      ref={ref}
      className={cn("truncate inline-block max-w-full", className)}
      style={{ maxWidth }}
      title={isOverflowing && typeof children === "string" ? children : undefined}
      {...props}
    >
      {children}
    </span>
  );
}

export { TextTruncate, TextLineClamp, TextBreak, TextWithTooltip };
