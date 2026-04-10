/**
 * @file 二级工作台布局模块。
 */

import { useState } from "react";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { cn } from "@/lib/utils";

type WorkbenchLayoutProps = {
  inspector: React.ReactNode;
  inspectorDescription: string;
  inspectorTitle: string;
  main: React.ReactNode;
  mainClassName?: string;
  mobileTitle: string;
  section: React.ReactNode;
  sectionDescription: string;
  sectionTitle: string;
};

export function WorkbenchLayout({
  inspector,
  inspectorDescription,
  inspectorTitle,
  main,
  mainClassName,
  mobileTitle,
  section,
  sectionDescription,
  sectionTitle,
}: WorkbenchLayoutProps) {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="surface-panel-subtle grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-3 py-2">
          <Sheet onOpenChange={setSectionOpen} open={sectionOpen}>
            <SheetTrigger
              render={<Button aria-label={sectionTitle} size="icon-sm" variant="ghost" />}
            >
              <PanelLeftIcon />
            </SheetTrigger>
            <SheetContent
              className="w-[88vw] max-w-sm bg-background/96 p-0"
              closeLabel={t("closeAction")}
              side="left"
            >
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>{sectionTitle}</SheetTitle>
                <SheetDescription>{sectionDescription}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 px-4 pb-4 pt-3">{section}</div>
            </SheetContent>
          </Sheet>

          <p className="truncate px-1 text-center text-sm font-medium text-foreground/92">
            {mobileTitle}
          </p>

          <Sheet onOpenChange={setInspectorOpen} open={inspectorOpen}>
            <SheetTrigger
              render={<Button aria-label={inspectorTitle} size="icon-sm" variant="ghost" />}
            >
              <PanelRightIcon />
            </SheetTrigger>
            <SheetContent
              className="w-[88vw] max-w-sm bg-background/96 p-0"
              closeLabel={t("closeAction")}
              side="right"
            >
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>{inspectorTitle}</SheetTitle>
                <SheetDescription>{inspectorDescription}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 px-4 pb-4 pt-3">{inspector}</div>
            </SheetContent>
          </Sheet>
        </div>

        <div className={cn("min-h-0 flex-1", mainClassName)}>{main}</div>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)_minmax(18rem,22rem)]"
      data-testid="workbench-layout"
    >
      <div className="min-h-0 min-w-0">{section}</div>
      <div className={cn("min-h-0 min-w-0", mainClassName)}>{main}</div>
      <div className="min-h-0 min-w-0 xl:col-span-2 2xl:col-span-1">{inspector}</div>
    </div>
  );
}
