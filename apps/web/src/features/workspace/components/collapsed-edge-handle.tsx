/**
 * @file 工作区折叠边缘按钮模块。
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 渲染折叠状态下的边缘展开按钮。
 */
export function CollapsedEdgeHandle({
  buttonLabel,
  onExpand,
  side,
}: {
  buttonLabel: string;
  onExpand: () => void;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-4 z-20 flex items-center",
        side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
      )}
    >
      <Button
        aria-label={buttonLabel}
        className="pointer-events-auto h-16 w-6 rounded-full border border-border/75 bg-background/84 p-0 text-muted-foreground shadow-[0_16px_30px_-22px_hsl(var(--shadow-color)/0.72),inset_0_1px_0_hsl(var(--surface-highlight)/0.82)] transition-[border-color,box-shadow,background-color,color] duration-200 hover:border-border hover:bg-background/94 hover:text-foreground hover:shadow-[0_20px_36px_-24px_hsl(var(--shadow-color)/0.82),inset_0_1px_0_hsl(var(--surface-highlight)/0.92)]"
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
        title={buttonLabel}
        type="button"
        variant="ghost"
      >
        <span
          aria-hidden="true"
          className="h-5 w-[2px] rounded-full bg-current/55 transition-transform duration-200"
        />
      </Button>
    </div>
  );
}
