/**
 * @file Tabs 基础 UI 组件模块。
 */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

const tabsVariants = cva("flex min-h-0 flex-col");

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn(tabsVariants(), className)} {...props} />;
}

const tabsListVariants = cva(
  "relative z-0 flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1",
);

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(tabsListVariants(), className)} {...props} />;
}

const tabsTabVariants = cva(
  "relative flex h-9 items-center justify-center rounded-lg border-0 px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-hidden transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-[active]:text-foreground",
);

function TabsTab({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return <TabsPrimitive.Tab className={cn(tabsTabVariants(), className)} {...props} />;
}

const tabsIndicatorVariants = cva(
  "absolute top-1 left-0 z-[-1] h-9 rounded-lg bg-background shadow-sm transition-[translate,width] duration-200 ease-out",
);

function TabsIndicator({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Indicator>) {
  return <TabsPrimitive.Indicator className={cn(tabsIndicatorVariants(), className)} {...props} />;
}

const tabsPanelVariants = cva(
  "min-h-0 flex-1 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60",
);

function TabsPanel({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel className={cn(tabsPanelVariants(), className)} {...props} />;
}

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsIndicator,
  TabsPanel,
  tabsVariants,
  tabsListVariants,
  tabsTabVariants,
  tabsIndicatorVariants,
  tabsPanelVariants,
};
