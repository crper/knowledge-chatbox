/**
 * @file 资源相关界面组件模块。
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { capitalize } from "es-toolkit";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { documentVersionsQueryOptions, type KnowledgeDocument } from "../api/documents-query";

type VersionDrawerProps = {
  documentId: number | null;
  open: boolean;
  onClose: () => void;
};

export function DocumentVersionList({ versions }: { versions: KnowledgeDocument[] }) {
  const { t } = useTranslation("knowledge");

  return (
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
              <p className="font-medium">{t("versionValue", { version: version.revision_no })}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`status${capitalize(version.ingest_status)}`)}
              </p>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * 渲染版本抽屉。
 */
export function VersionDrawer({ documentId, open, onClose }: VersionDrawerProps) {
  const { t } = useTranslation("knowledge");
  const versionsQuery = useQuery(
    documentVersionsQueryOptions(documentId ?? -1, open && documentId !== null),
  );

  const versions = versionsQuery.data ?? [];

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

        {versionsQuery.isPending ? (
          <div className="p-4 text-sm text-muted-foreground">{t("loading")}</div>
        ) : versionsQuery.isError ? (
          <div className="p-4 text-sm text-muted-foreground">{t("previewLoadFailed")}</div>
        ) : (
          <DocumentVersionList versions={versions} />
        )}
      </SheetContent>
    </Sheet>
  );
}
