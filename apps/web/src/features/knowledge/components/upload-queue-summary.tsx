/**
 * @file 资源页上传队列组件模块。
 */

import { useCallback, memo, useEffect, useMemo, useState } from "react";
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
import { clamp } from "es-toolkit";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type UploadQueueItem = {
  errorMessage?: string;
  id: string;
  name: string;
  progress: number;
  status: "failed" | "uploading" | "uploaded";
};

type UploadQueueSummaryProps = {
  items: UploadQueueItem[];
  onCancel: (uploadId: string) => void;
  onRemove: (uploadId: string) => void;
  onRetry: (uploadId: string) => void;
};

type FailedQueueItemProps = {
  item: UploadQueueItem;
  onRemove: (uploadId: string) => void;
  onRetry: (uploadId: string) => void;
};

const FailedQueueItem = memo(function FailedQueueItem({
  item,
  onRemove,
  onRetry,
}: FailedQueueItemProps) {
  const { t } = useTranslation("knowledge");

  return (
    <div
      className={cn(
        "surface-light flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5",
        "border-destructive/15 bg-destructive/6",
      )}
      key={item.id}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-xs text-destructive">{item.errorMessage || t("uploadItemFailed")}</p>
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
  );
});

type UploadingQueueItemProps = {
  item: UploadQueueItem;
  onCancel: (uploadId: string) => void;
};

const UploadingQueueItem = memo(function UploadingQueueItem({
  item,
  onCancel,
}: UploadingQueueItemProps) {
  const { t } = useTranslation("knowledge");
  const isProcessing = item.progress >= 100;
  const progressWidth = isProcessing ? 100 : clamp(item.progress, 0, 100);

  return (
    <div
      className={cn(
        "surface-light flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5",
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
        <div className="mt-2">
          <Progress
            value={progressWidth}
            className={cn(
              "h-1.5",
              isProcessing &&
                "[&>[data-slot=progress-indicator]]:animate-pulse [&>[data-slot=progress-indicator]]:bg-primary/70",
            )}
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
});

/**
 * 渲染资源页紧凑上传队列。
 */
export const UploadQueueSummary = memo(function UploadQueueSummary({
  items,
  onCancel,
  onRemove,
  onRetry,
}: UploadQueueSummaryProps) {
  const { t } = useTranslation("knowledge");
  const [expanded, setExpanded] = useState(true);

  const failedItems = useMemo(() => items.filter((item) => item.status === "failed"), [items]);
  const uploadingItems = useMemo(
    () => items.filter((item) => item.status === "uploading"),
    [items],
  );
  const hasVisibleItems = failedItems.length > 0 || uploadingItems.length > 0;

  useEffect(() => {
    if (failedItems.length > 0) {
      setExpanded(true);
    }
  }, [failedItems.length]);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  if (!hasVisibleItems) {
    return null;
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <section className="surface-panel-subtle space-y-3 rounded-xl p-3 md:p-4">
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

          <CollapsibleTrigger
            render={
              <Button
                className="self-start"
                onClick={handleToggleExpanded}
                size="sm"
                type="button"
                variant="ghost"
              />
            }
          >
            {expanded ? (
              <ChevronUpIcon data-icon="inline-start" />
            ) : (
              <ChevronDownIcon data-icon="inline-start" />
            )}
            {expanded ? t("queueCollapseAction") : t("queueExpandAction")}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="space-y-2">
          {uploadingItems.map((item) => (
            <UploadingQueueItem item={item} key={item.id} onCancel={onCancel} />
          ))}

          {failedItems.map((item) => (
            <FailedQueueItem item={item} key={item.id} onRemove={onRemove} onRetry={onRetry} />
          ))}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
});
