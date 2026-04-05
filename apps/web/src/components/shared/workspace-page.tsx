/**
 * @file 工作区页面共享组件模块。
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="workspace-surface-subtle shadow-none" size="sm">
      <CardContent className="pt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-ui-caption text-muted-foreground">{label}</p>
            <p className="text-ui-heading text-foreground">{value}</p>
            {detail ? <p className="text-ui-subtle text-muted-foreground">{detail}</p> : null}
          </div>
          <span className="surface-light flex size-10 shrink-0 items-center justify-center rounded-2xl text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </div>
      </CardContent>
    </Card>
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
        <section
          className={cn(
            // 更统一的 metrics 间距
            "grid gap-3 rounded-2xl border border-border/40 bg-muted/20 px-4 py-4 md:grid-cols-3",
            metricsClassName,
          )}
        >
          {metrics}
        </section>
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
