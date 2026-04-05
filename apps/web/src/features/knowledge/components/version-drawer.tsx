/**
 * @file 资源相关界面组件模块。
 */

import { useTranslation } from "react-i18next";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { KnowledgeDocument } from "../api/documents";

type VersionDrawerProps = {
  open: boolean;
  versions: KnowledgeDocument[];
  onClose: () => void;
};

/**
 * 渲染版本抽屉。
 */
export function VersionDrawer({ open, versions, onClose }: VersionDrawerProps) {
  const { t } = useTranslation("knowledge");

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent
        className="w-full max-w-md gap-0 p-0 sm:max-w-md"
        closeLabel={t("closeAction")}
        overlayProps={{ onClick: onClose }}
        side="right"
      >
        <SheetHeader className="border-b border-border/70">
          <SheetTitle>{t("versionHistoryTitle")}</SheetTitle>
          <SheetDescription>{t("versionHistoryDescription")}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 p-4">
            {versions.length === 0 ? (
              <Empty className="bg-background/40">
                <EmptyHeader>
                  <EmptyTitle>{t("versionEmptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("versionEmptyDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              versions.map((version) => (
                <div key={version.id} className="surface-light rounded-2xl px-4 py-3">
                  <p className="font-medium">{t("versionValue", { version: version.version })}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`status${version.status.charAt(0).toUpperCase()}${version.status.slice(1)}`)}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
