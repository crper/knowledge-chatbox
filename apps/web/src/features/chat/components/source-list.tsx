/**
 * @file 聊天相关界面组件模块。
 */

import { FileSearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SourceListProps = {
  sources: Array<{
    chunk_id: string;
    document_name?: string;
    section_title?: string;
    page_number?: number;
    snippet?: string;
  }>;
};

/**
 * 渲染消息来源列表。
 */
export function SourceList({ sources }: SourceListProps) {
  const { t } = useTranslation("chat");

  if (sources.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-wrap items-center gap-1.5">
        {sources.map((source, index) => {
          const title = source.document_name ?? source.section_title ?? source.chunk_id;
          const pageLabel =
            source.page_number != null ? t("sourcePage", { page: source.page_number }) : null;

          return (
            <Tooltip key={source.chunk_id}>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("sourceReferenceAction", {
                    defaultValue: "查看引用 {{index}}",
                    index: index + 1,
                  })}
                  className="h-7 rounded-full border border-border/70 bg-muted/24 px-2.5 text-[0.72rem] text-muted-foreground hover:bg-muted/40"
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  <FileSearchIcon aria-hidden="true" className="size-3.5 text-primary" />
                  <span>{index + 1}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <div className="space-y-1">
                  <p className="font-medium">{title}</p>
                  {pageLabel ? <p className="text-[11px] opacity-80">{pageLabel}</p> : null}
                  {source.snippet ? (
                    <p className="text-[11px] leading-5 opacity-90">{source.snippet}</p>
                  ) : null}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
