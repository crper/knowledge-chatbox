/**
 * @file 工作区页面共享组件模块。
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WorkspaceMetricCardProps = {
  detail?: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
};

type WorkspacePageProps = {
  actions?: ReactNode;
  aside?: ReactNode;
  badge?: ReactNode;
  className?: string;
  dataTestId?: string;
  description: ReactNode;
  headerClassName?: string;
  layoutClassName?: string;
  main: ReactNode;
  metrics?: ReactNode;
  metricsClassName?: string;
  surface?: "default" | "flat";
  title: ReactNode;
  width?: "wide" | "content";
};

/**
 * 定义工作区指标卡片。
 */
export function WorkspaceMetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: WorkspaceMetricCardProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[1.75rem] border border-border/60 bg-background/84 px-5 py-4 shadow-[0_1px_0_hsl(var(--border)/0.24)] backdrop-blur-sm">
      <div className="min-w-0 space-y-1">
        <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <span className="surface-light flex size-11 shrink-0 items-center justify-center rounded-2xl text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
    </div>
  );
}

/**
 * 渲染工作区页面。
 */
export function WorkspacePage({
  actions,
  aside,
  badge,
  className,
  dataTestId,
  description,
  headerClassName,
  layoutClassName,
  main,
  metrics,
  metricsClassName,
  surface = "default",
  title,
  width = "wide",
}: WorkspacePageProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col",
        // 统一的间距系统：紧凑的 4-6-8 节奏
        "px-4 py-5 lg:px-8 lg:py-8",
        width === "content" ? "max-w-4xl" : "max-w-7xl",
        surface === "flat"
          ? "gap-6 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.07),transparent_32%)] lg:gap-8"
          : "gap-6 lg:gap-8",
        className,
      )}
      data-layout-surface={surface}
      data-layout-width={width}
      data-testid={dataTestId}
    >
      <section
        className={cn(
          // 更紧凑的 header 间距
          "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
          surface === "flat" ? "gap-3" : "",
          headerClassName,
        )}
      >
        <div className="space-y-2.5">
          {badge ? (
            <Badge className="rounded-full px-3 py-1" variant="outline">
              {badge}
            </Badge>
          ) : null}
          <div className="space-y-1.5">
            <h1 className="text-ui-display">{title}</h1>
            <div className="text-ui-body measure-readable text-muted-foreground">{description}</div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-start gap-3">{actions}</div> : null}
      </section>

      {metrics ? (
        <section className={cn("grid gap-3 md:grid-cols-3", metricsClassName)}>{metrics}</section>
      ) : null}

      <section
        className={cn(
          // 优化主内容区域比例和间距
          "grid gap-5",
          aside ? "xl:items-start xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-1",
          surface === "flat" ? "gap-6" : "",
          layoutClassName,
        )}
      >
        <div className="min-w-0">{main}</div>
        {aside ? <aside className="grid auto-rows-max gap-4">{aside}</aside> : null}
      </section>
    </div>
  );
}
