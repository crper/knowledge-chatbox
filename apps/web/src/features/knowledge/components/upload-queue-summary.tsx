/**
 * @file 资源页上传队列组件模块。
 */

import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  PauseIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UploadQueueItem = {
  errorMessage?: string;
  id: string;
  name: string;
  progress: number;
  status: "failed" | "uploading";
};

type UploadQueueSummaryProps = {
  items: UploadQueueItem[];
  onCancel: (uploadId: string) => void;
  onRemove: (uploadId: string) => void;
  onRetry: (uploadId: string) => void;
};

/**
 * 渲染资源页紧凑上传队列。
 */
export function UploadQueueSummary({
  items,
  onCancel,
  onRemove,
  onRetry,
}: UploadQueueSummaryProps) {
  const { t } = useTranslation("knowledge");
  const failedItems = items.filter((item) => item.status === "failed");
  const uploadingItems = items.filter((item) => item.status === "uploading");
  const [expanded, setExpanded] = useState(true);
  const hasItems = items.length > 0;

  useEffect(() => {
    if (failedItems.length > 0) {
      setExpanded(true);
    }
  }, [failedItems.length]);

  if (!hasItems) {
    return null;
  }

  return (
    <section className="surface-panel-subtle space-y-3 rounded-[1.25rem] p-3 md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="text-ui-title text-foreground">{t("queueCompactTitle")}</p>
          {uploadingItems.length > 0 ? (
            <Badge className="shrink-0" variant="secondary">
              <LoaderCircleIcon data-icon="inline-start" />
              {t("queueUploadingCount", { count: uploadingItems.length })}
            </Badge>
          ) : null}
          {failedItems.length > 0 ? (
            <Badge className="shrink-0" variant="destructive">
              <CircleAlertIcon data-icon="inline-start" />
              {t("queueFailedCount", { count: failedItems.length })}
            </Badge>
          ) : null}
        </div>

        <Button
          className="self-start"
          onClick={() => setExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {expanded ? (
            <ChevronUpIcon data-icon="inline-start" />
          ) : (
            <ChevronDownIcon data-icon="inline-start" />
          )}
          {expanded ? t("queueCollapseAction") : t("queueExpandAction")}
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-2">
          {uploadingItems.map((item) => (
            <UploadingQueueItem item={item} key={item.id} onCancel={onCancel} />
          ))}

          {failedItems.map((item) => (
            <div
              className={cn(
                "surface-outline flex flex-wrap items-center justify-between gap-3 rounded-[1rem] px-3 py-2.5",
                "border-destructive/15 bg-destructive/6",
              )}
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-destructive">
                  {item.errorMessage || t("uploadItemFailed")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => onRetry(item.id)} size="sm" type="button" variant="outline">
                  <RotateCcwIcon data-icon="inline-start" />
                  {t("retryUploadAction")}
                </Button>
                <Button
                  aria-label={t("removeUploadAction", { name: item.name })}
                  onClick={() => onRemove(item.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon data-icon="inline-start" />
                  {t("deleteAction")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type UploadingQueueItemProps = {
  item: UploadQueueItem;
  onCancel: (uploadId: string) => void;
};

/**
 * 渲染进行中的上传项。
 */
function UploadingQueueItem({ item, onCancel }: UploadingQueueItemProps) {
  const { t } = useTranslation("knowledge");
  const isProcessing = item.progress >= 100;
  const progressWidth = isProcessing ? 100 : Math.min(Math.max(item.progress, 0), 100);

  return (
    <div
      className={cn(
        "surface-outline flex flex-wrap items-center justify-between gap-3 rounded-[1rem] px-3 py-2.5",
        "border-border/70 bg-background/52",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <Badge variant="secondary">
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            {isProcessing
              ? t("uploadItemProcessing")
              : t("uploadItemUploading", { progress: item.progress })}
          </Badge>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-200",
              isProcessing ? "animate-pulse bg-primary/70" : "bg-primary",
            )}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label={t("cancelUploadAction", { name: item.name })}
          onClick={() => onCancel(item.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <PauseIcon data-icon="inline-start" />
          {t("cancelUploadShortAction")}
        </Button>
      </div>
    </div>
  );
}
