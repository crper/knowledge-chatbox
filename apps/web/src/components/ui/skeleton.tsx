/**
 * @file Skeleton基础 UI 组件模块。
 */

import { cn } from "@/lib/utils";

/**
 * 定义Skeleton。
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
