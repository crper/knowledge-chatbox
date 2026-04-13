/**
 * @file 聊天图片查看器组件模块。
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clamp } from "es-toolkit";

import { Button } from "@/components/ui/button";
import { triggerDownload } from "@/lib/dom";
import { imageViewerRemoteQueryOptions } from "../api/chat-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ImageViewerItem =
  | {
      displayName?: string;
      kind: "local";
      id: string;
      name: string;
      mimeType: string;
      file: File;
    }
  | {
      displayName?: string;
      kind: "remote";
      id: string;
      name: string;
      mimeType: string;
      originalUrl: string;
      documentRevisionId: number;
    };

type ImageViewerDialogProps = {
  initialIndex?: number;
  items: ImageViewerItem[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function clampIndex(index: number, length: number) {
  if (length === 0) {
    return 0;
  }
  return clamp(index, 0, length - 1);
}

export function ImageViewerDialog({
  initialIndex = 0,
  items,
  onOpenChange,
  open,
}: ImageViewerDialogProps) {
  const { t } = useTranslation(["chat", "common"]);
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, items.length));

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(clampIndex(initialIndex, items.length));
  }, [initialIndex, items.length, open]);

  const currentItem = useMemo(() => items[activeIndex] ?? null, [activeIndex, items]);
  const currentItemLabel = currentItem?.displayName ?? currentItem?.name ?? "";
  const countLabel = t("imageViewerCountLabel", {
    current: activeIndex + 1,
    total: items.length,
  });

  const isLocalItem = currentItem?.kind === "local";
  const localObjectUrl = useMemo(() => {
    if (!isLocalItem || !currentItem || !open) return null;
    if (currentItem.kind !== "local") return null;
    return URL.createObjectURL(currentItem.file);
  }, [isLocalItem, currentItem, open]);

  useEffect(() => {
    return () => {
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [localObjectUrl]);

  const { data: remoteObjectUrl, isError: remoteLoadFailed } = useQuery(
    imageViewerRemoteQueryOptions(
      currentItem?.kind === "remote" ? currentItem.originalUrl : null,
      open && currentItem?.kind === "remote",
    ),
  );

  const resolvedUrl = isLocalItem ? localObjectUrl : (remoteObjectUrl ?? null);
  const loadFailed = !isLocalItem && remoteLoadFailed;

  if (!currentItem) {
    return null;
  }

  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < items.length - 1;
  const showNavigation = items.length > 1;
  const remoteActionDisabled = currentItem.kind === "remote" && (!resolvedUrl || loadFailed);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden border border-border/70 bg-background/96 p-0 shadow-2xl sm:max-w-5xl"
        closeLabel={t("closeAction", { ns: "common" })}
      >
        <DialogHeader className="border-b border-border/70 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="break-all text-sm leading-5 sm:text-lg sm:leading-6">
                {currentItemLabel}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {items.length > 1 ? countLabel : t("imageViewerSingleLabel")}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {currentItem.kind === "remote" ? (
                <>
                  <Button
                    className="size-9 px-0 sm:h-8 sm:w-auto sm:px-3"
                    disabled={remoteActionDisabled}
                    onClick={() => {
                      if (!resolvedUrl) {
                        return;
                      }
                      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    <span className="sr-only sm:not-sr-only sm:inline">
                      {t("imageViewerOpenOriginalAction")}
                    </span>
                  </Button>
                  <Button
                    className="size-9 px-0 sm:h-8 sm:w-auto sm:px-3"
                    disabled={remoteActionDisabled}
                    onClick={() => {
                      if (!resolvedUrl) {
                        return;
                      }
                      triggerDownload(resolvedUrl, currentItem.name);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <DownloadIcon data-icon="inline-start" />
                    <span className="sr-only sm:not-sr-only sm:inline">
                      {t("imageViewerDownloadAction")}
                    </span>
                  </Button>
                </>
              ) : (
                <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                  {t("imageViewerLocalImageBadge")}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="relative flex min-h-[52vh] items-center justify-center bg-muted/25 px-3 py-3 sm:min-h-[60vh] sm:px-6 sm:py-6">
          {showNavigation ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-between px-3 sm:inset-x-auto sm:inset-y-0 sm:left-0 sm:right-0 sm:top-1/2 sm:-translate-y-1/2 sm:px-3">
              <Button
                aria-label={t("imageViewerPreviousAction")}
                className="pointer-events-auto shadow-lg"
                disabled={!canGoPrevious}
                onClick={() => setActiveIndex((current) => Math.max(current - 1, 0))}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                aria-label={t("imageViewerNextAction")}
                className="pointer-events-auto shadow-lg"
                disabled={!canGoNext}
                onClick={() => setActiveIndex((current) => Math.min(current + 1, items.length - 1))}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}

          {loadFailed ? (
            <p className="text-sm text-muted-foreground">{t("markdown.imageNotAvailable")}</p>
          ) : resolvedUrl ? (
            <img
              alt={currentItemLabel}
              className="max-h-[70vh] w-auto max-w-full rounded-xl border border-border/70 bg-background object-contain shadow-sm sm:max-h-[80vh]"
              src={resolvedUrl}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("imageViewerLoadingLabel")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
