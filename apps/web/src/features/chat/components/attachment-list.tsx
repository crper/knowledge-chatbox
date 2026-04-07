/**
 * @file 聊天附件列表组件模块。
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  FileImageIcon,
  FileTextIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttachmentListItem } from "../utils/attachment-list-items";

type AttachmentListProps = {
  defaultCollapsed?: boolean;
  expandOnItemAdd?: boolean;
  items: AttachmentListItem[];
  testId?: string;
};

function getAttachmentIcon(kind: AttachmentListItem["kind"]) {
  return kind === "image" ? FileImageIcon : FileTextIcon;
}

/**
 * 渲染统一的聊天附件列表。
 */
export function AttachmentList({
  defaultCollapsed = false,
  expandOnItemAdd = false,
  items,
  testId,
}: AttachmentListProps) {
  const { t } = useTranslation("chat");
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const previousCountRef = useRef(items.length);

  useEffect(() => {
    const previousCount = previousCountRef.current;

    if (items.length === 0) {
      setCollapsed(defaultCollapsed);
      previousCountRef.current = items.length;
      return;
    }

    if (expandOnItemAdd && items.length > previousCount) {
      setCollapsed(false);
    }

    previousCountRef.current = items.length;
  }, [defaultCollapsed, expandOnItemAdd, items.length]);

  const toggleLabel = collapsed
    ? t("expandAttachmentAction", { defaultValue: "展开附件" })
    : t("collapseAttachmentAction", { defaultValue: "收起附件" });
  const ToggleIcon = collapsed ? ChevronDownIcon : ChevronUpIcon;

  return (
    <section className="surface-inline overflow-hidden rounded-xl">
      <div className="flex select-none items-center justify-between gap-2.5 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground/88">
          {t("attachmentPanelLabel", {
            count: items.length,
            defaultValue: "附件 {{count}}",
          })}
        </p>
        <Button
          aria-controls={contentId}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          className="h-6 gap-1 rounded-full px-1.5 text-[11px] text-muted-foreground/68 hover:text-foreground"
          onClick={() => setCollapsed((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ToggleIcon className="size-3" />
          <span>{toggleLabel}</span>
        </Button>
      </div>
      {!collapsed ? (
        <ul
          className="max-h-40 divide-y divide-border/50 overflow-y-auto border-t border-border/50"
          data-testid={testId}
          id={contentId}
        >
          {items.map((item, index) => {
            const AttachmentIcon = getAttachmentIcon(item.kind);
            const itemKey = `${item.id}:${item.rawName ?? item.displayName}:${index}`;

            return (
              <li
                key={itemKey}
                className="flex min-w-0 items-center gap-2 px-2.5 py-1.5"
                title={item.rawName ?? item.displayName}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    item.kind === "image"
                      ? "border-primary/16 bg-primary/7 text-primary/82"
                      : "border-border/56 bg-background/62 text-muted-foreground/72",
                  )}
                >
                  <AttachmentIcon className="size-3" />
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {item.displayName}
                </p>
                <div className="flex shrink-0 select-none items-center gap-1">
                  {item.statusLabel ? (
                    <span className="max-w-24 truncate text-[10px] text-muted-foreground/64">
                      {item.statusLabel}
                    </span>
                  ) : null}
                  {item.previewable ? (
                    <Button
                      aria-label={t("previewAttachmentAction", {
                        defaultValue: "预览附件 {{name}}",
                        name: item.displayName,
                      })}
                      className="text-muted-foreground/68 hover:text-foreground"
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
                      className="text-muted-foreground/68 hover:text-foreground"
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
          })}
        </ul>
      ) : null}
    </section>
  );
}

export type { AttachmentListItem };
