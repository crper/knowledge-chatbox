/**
 * @file 资源工作台工具条模块。
 */

import { useState } from "react";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar";
import { Input } from "@/components/ui/input";

type ResourceWorkbenchToolbarProps = {
  activeFilterBadges: string[];
  activeFilterCount: number;
  clearFilters: () => void;
  isMobile: boolean;
  renderUploadAction: (fullWidth?: boolean) => React.ReactNode;
  searchValue: string;
  setSearchValue: (value: string) => void;
  statusFilterButtons: React.ReactNode;
  typeFilterButtons: React.ReactNode;
};

export function ResourceWorkbenchToolbar({
  activeFilterBadges,
  activeFilterCount,
  clearFilters,
  isMobile,
  renderUploadAction,
  searchValue,
  setSearchValue,
  statusFilterButtons,
  typeFilterButtons,
}: ResourceWorkbenchToolbarProps) {
  const { t } = useTranslation("knowledge");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const filterPanelSections = (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t("filterTypeSectionTitle")}
        </p>
        <div className="flex flex-wrap gap-2 pb-1">{typeFilterButtons}</div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t("filterStatusSectionTitle")}
        </p>
        <div className="flex flex-wrap gap-2 pb-1">{statusFilterButtons}</div>
      </section>
    </div>
  );

  const clearFiltersAction =
    activeFilterCount > 0 ? (
      <Button
        className="w-full"
        onClick={() => {
          clearFilters();
          setMobileFilterOpen(false);
        }}
        type="button"
        variant="ghost"
      >
        {t("clearFiltersAction")}
      </Button>
    ) : null;

  const desktopFilterPanelContent = (
    <div className="space-y-4">
      {filterPanelSections}
      {clearFiltersAction}
    </div>
  );

  return (
    <div className="space-y-3">
      <Toolbar className="items-stretch sm:items-center">
        <ToolbarGroup className="min-w-[min(14rem,100%)] flex-1 sm:min-w-[16rem] lg:min-w-[18rem]">
          <label className="relative w-full">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/72" />
            <Input
              aria-label={t("searchInputLabel")}
              className="h-10 rounded-xl border-border/50 bg-background/80 pl-9 text-sm"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("searchInputPlaceholder")}
              value={searchValue}
            />
          </label>
        </ToolbarGroup>

        <ToolbarSeparator className="hidden md:block" />

        {isMobile ? (
          <Sheet onOpenChange={setMobileFilterOpen} open={mobileFilterOpen} side="bottom">
            <SheetTrigger
              render={
                <Button
                  aria-label={t("mobileFilterTitle")}
                  type="button"
                  variant={activeFilterCount > 0 ? "secondary" : "outline"}
                />
              }
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              {activeFilterCount > 0
                ? t("mobileFilterActionWithCount", { count: activeFilterCount })
                : t("mobileFilterAction")}
            </SheetTrigger>
            <SheetContent
              className="max-h-[min(80dvh,42rem)] min-h-0 rounded-t-3xl p-0"
              closeLabel={t("closeAction")}
              side="bottom"
            >
              <SheetHeader className="pr-12">
                <SheetTitle>{t("mobileFilterTitle")}</SheetTitle>
                <SheetDescription>{t("mobileFilterDescription")}</SheetDescription>
              </SheetHeader>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
                data-testid="knowledge-mobile-filter-body"
              >
                <div className="space-y-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  {filterPanelSections}
                </div>
              </div>
              {clearFiltersAction ? (
                <SheetFooter
                  className="shrink-0 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] supports-backdrop-filter:backdrop-blur"
                  data-testid="knowledge-mobile-filter-footer"
                >
                  {clearFiltersAction}
                </SheetFooter>
              ) : null}
            </SheetContent>
          </Sheet>
        ) : (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label={t("mobileFilterTitle")}
                  type="button"
                  variant={activeFilterCount > 0 ? "secondary" : "outline"}
                />
              }
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              {activeFilterCount > 0
                ? t("mobileFilterActionWithCount", { count: activeFilterCount })
                : t("mobileFilterAction")}
            </PopoverTrigger>
            <PopoverContent>
              <div className="space-y-4">
                <div className="space-y-1">
                  <PopoverTitle>{t("mobileFilterTitle")}</PopoverTitle>
                  <PopoverDescription>{t("mobileFilterDescription")}</PopoverDescription>
                </div>
                {desktopFilterPanelContent}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {renderUploadAction()}
      </Toolbar>

      {activeFilterBadges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterBadges.map((label) => (
            <Badge className="rounded-full px-3 py-1" key={label} variant="outline">
              {label}
            </Badge>
          ))}
          <Button onClick={clearFilters} size="sm" type="button" variant="ghost">
            {t("clearFiltersAction")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
