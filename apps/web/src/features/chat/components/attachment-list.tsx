/**
 * @file 聊天附件列表组件模块。
 */

import { memo, useEffect, useRef, useState, useMemo } from "react";
import { ChevronDownIcon, EyeIcon, FileImageIcon, FileTextIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AttachmentListItem } from "../utils/attachment-list-items";

type AttachmentListProps = {
  defaultCollapsed?: boolean;
  expandOnItemAdd?: boolean;
  hideScrollbar?: boolean;
  items: AttachmentListItem[];
  listMaxHeightClassName?: string;
  testId?: string;
  variant?: "default" | "compact";
};

function getAttachmentIcon(kind: AttachmentListItem["kind"]) {
  return kind === "image" ? FileImageIcon : FileTextIcon;
}

/**
 * 渲染单个附件列表项，使用 memo 优化避免不必要的重渲染。
 */
const AttachmentListItemRow = memo(function AttachmentListItemRow({
  item,
  isCompact,
  t,
}: {
  item: AttachmentListItem;
  isCompact: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const AttachmentIcon = getAttachmentIcon(item.kind);
  const itemKey = `${item.id}:${item.rawName ?? item.displayName}`;

  return (
    <li
      key={itemKey}
      className={cn(
        "flex min-w-0 items-center gap-2 overflow-hidden",
        isCompact
          ? "rounded-2xl border border-border/42 bg-background/84 px-2.5 py-2 shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.08)]"
          : "px-2.5 py-1.5",
      )}
      title={item.rawName ?? item.displayName}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center border",
          isCompact ? "size-9 rounded-2xl" : "size-6 rounded-full",
          item.kind === "image"
            ? "border-primary/16 bg-primary/7 text-primary/82"
            : "border-border/56 bg-background/62 text-muted-foreground/72",
        )}
      >
        <AttachmentIcon className={isCompact ? "size-4" : "size-3"} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium text-foreground",
            isCompact ? "text-[13px] leading-5" : "text-xs",
          )}
        >
          {item.displayName}
        </p>
        {isCompact ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/62">
            {item.kind === "image"
              ? t("imageTypeLabel", { defaultValue: "图片" })
              : t("documentTypeLabel", { defaultValue: "文件" })}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 select-none items-center gap-1">
        {item.statusLabel ? (
          <span
            className={cn(
              "truncate text-muted-foreground/64",
              isCompact
                ? "max-w-20 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px]"
                : "max-w-24 text-[10px]",
            )}
          >
            {item.statusLabel}
          </span>
        ) : null}
        {item.previewable ? (
          <Button
            aria-label={t("previewAttachmentAction", {
              defaultValue: "预览附件 {{name}}",
              name: item.displayName,
            })}
            className={cn(
              "text-muted-foreground/68 hover:text-foreground",
              isCompact ? "rounded-xl" : "",
            )}
            onClick={item.onPreview}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <EyeIcon className="size-3" />
          </Button>
        ) : null}
        {item.onRemove ? (
          <Button
            aria-label={t("removeAttachmentAction", { name: item.displayName })}
            className={cn(
              "text-muted-foreground/68 hover:text-foreground",
              isCompact ? "rounded-xl" : "",
            )}
            onClick={item.onRemove}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
    </li>
  );
});

/**
 * 渲染统一的聊天附件列表。
 */
export const AttachmentList = memo(function AttachmentList({
  defaultCollapsed = false,
  expandOnItemAdd = false,
  hideScrollbar = false,
  items,
  listMaxHeightClassName,
  testId,
  variant = "default",
}: AttachmentListProps) {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(!defaultCollapsed);
  const previousCountRef = useRef(items.length);

  useEffect(() => {
    const previousCount = previousCountRef.current;

    if (items.length === 0) {
      setOpen(!defaultCollapsed);
      previousCountRef.current = items.length;
      return;
    }

    if (expandOnItemAdd && items.length > previousCount) {
      setOpen(true);
    }

    previousCountRef.current = items.length;
  }, [defaultCollapsed, expandOnItemAdd, items.length]);

  const toggleLabel = useMemo(
    () =>
      open
        ? t("collapseAttachmentAction", { defaultValue: "收起附件" })
        : t("expandAttachmentAction", { defaultValue: "展开附件" }),
    [open, t],
  );
  const isCompact = useMemo(() => variant === "compact", [variant]);

  return (
    <Collapsible
      className={cn(
        "overflow-hidden",
        isCompact ? "rounded-2xl bg-background/42" : "surface-inline rounded-xl",
      )}
      onOpenChange={setOpen}
      open={open}
    >
      <div
        className={cn(
          "flex min-w-0 select-none items-center justify-between gap-2.5",
          isCompact ? "px-3 py-2.5" : "px-2.5 py-2",
        )}
      >
        <p className="min-w-0 flex-1 truncate font-medium text-[11px] text-foreground/88">
          {t("attachmentPanelLabel", {
            count: items.length,
            defaultValue: "附件 {{count}}",
          })}
        </p>
        <CollapsibleTrigger
          render={
            <Button
              aria-label={toggleLabel}
              className={cn(
                "h-6 shrink-0 gap-1 rounded-full px-1.5 text-[11px] text-muted-foreground/68 hover:text-foreground",
              )}
              size="sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <ChevronDownIcon className="size-3 transition-transform duration-150 group-data-[panel-open]/collapsible:rotate-180" />
          <span>{toggleLabel}</span>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul
          className={cn(
            "overflow-x-hidden overflow-y-auto",
            hideScrollbar ? "no-visible-scrollbar" : null,
            isCompact
              ? "max-h-44 space-y-2 border-t border-border/42 px-2.5 py-2.5"
              : "max-h-40 divide-y divide-border/50 border-t border-border/50",
            listMaxHeightClassName,
          )}
          data-attachment-list-variant={variant}
          data-testid={testId}
        >
          {items.map((item, index) => (
            <AttachmentListItemRow
              key={`${item.id}:${index}`}
              item={item}
              isCompact={isCompact}
              t={t}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
});

export type { AttachmentListItem };
