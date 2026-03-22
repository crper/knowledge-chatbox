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
    <section className="surface-outline overflow-hidden rounded-[1rem]">
      <div className="flex select-none items-center justify-between gap-3 px-3 py-2.5">
        <p className="text-[0.76rem] font-medium tracking-[0.02em] text-foreground/92">
          {t("attachmentPanelLabel", {
            count: items.length,
            defaultValue: "附件 {{count}}",
          })}
        </p>
        <Button
          aria-controls={contentId}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          className="h-7 gap-1 rounded-full px-2 text-[0.72rem] text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ToggleIcon className="size-3.5" />
          <span>{toggleLabel}</span>
        </Button>
      </div>
      {!collapsed ? (
        <ul
          className="max-h-44 divide-y divide-border/60 overflow-y-auto border-t border-border/60"
          data-testid={testId}
          id={contentId}
        >
          {items.map((item) => {
            const AttachmentIcon = getAttachmentIcon(item.kind);

            return (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2.5 px-3 py-2"
                title={item.rawName ?? item.displayName}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    item.kind === "image"
                      ? "border-primary/18 bg-primary/8 text-primary"
                      : "border-border/70 bg-background/62 text-muted-foreground",
                  )}
                >
                  <AttachmentIcon className="size-3.5" />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {item.displayName}
                </p>
                <div className="flex shrink-0 select-none items-center gap-1.5">
                  {item.statusLabel ? (
                    <span className="max-w-28 truncate text-[0.72rem] text-muted-foreground">
                      {item.statusLabel}
                    </span>
                  ) : null}
                  {item.previewable ? (
                    <Button
                      aria-label={t("previewAttachmentAction", {
                        defaultValue: "预览附件 {{name}}",
                        name: item.displayName,
                      })}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={item.onPreview}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <EyeIcon className="size-3.5" />
                    </Button>
                  ) : null}
                  {item.onRemove ? (
                    <Button
                      aria-label={t("removeAttachmentAction", { name: item.displayName })}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={item.onRemove}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3.5" />
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
