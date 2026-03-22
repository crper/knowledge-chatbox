/**
 * @file 加载指示器基础 UI 组件模块。
 */

import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

/**
 * 定义加载指示器。
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
