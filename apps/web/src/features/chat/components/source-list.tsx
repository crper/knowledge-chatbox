import { memo } from "react";
import { FileSearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";
import type { ChatSourceItem } from "@/features/chat/api/chat";

type SourceItemProps = {
  index: number;
  source: ChatSourceItem;
};

function buildSourceItemKey(source: ChatSourceItem, index: number): string {
  const normalizedChunkId = source.chunk_id?.trim() || undefined;
  const normalizedSnippet = source.snippet?.trim() || "";

  if (source.document_revision_id != null && normalizedChunkId) {
    return `revision-chunk:${source.document_revision_id}:${normalizedChunkId}`;
  }
  if (source.document_id != null && normalizedChunkId) {
    return `document-chunk:${source.document_id}:${normalizedChunkId}`;
  }

  return [
    "fallback",
    source.document_id ?? "",
    source.document_revision_id ?? "",
    source.document_name ?? "",
    normalizedChunkId ?? "",
    source.page_number ?? "",
    source.section_title ?? "",
    normalizedSnippet,
    index,
  ].join(":");
}

const SourceItem = memo(function SourceItem({ index, source }: SourceItemProps) {
  const { t } = useTranslation("chat");
  const title =
    source.document_name ??
    source.section_title ??
    source.chunk_id ??
    t("sourceReferenceAction", {
      index: index + 1,
    });
  const pageLabel =
    source.page_number != null ? t("sourcePage", { page: source.page_number }) : null;

  return (
    <PreviewCard>
      <PreviewCardTrigger
        delay={200}
        render={
          <Button
            aria-label={t("sourceReferenceAction", {
              index: index + 1,
            })}
            className="h-7 rounded-full border border-border/70 bg-muted/24 px-2.5 text-ui-caption text-muted-foreground hover:bg-muted/40"
            size="xs"
            type="button"
            variant="ghost"
          />
        }
      >
        <FileSearchIcon aria-hidden="true" className="size-3.5 text-primary" />
        <span>{index + 1}</span>
      </PreviewCardTrigger>
      <PreviewCardContent className="max-w-sm" side="top">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {pageLabel ? <p className="text-[11px] opacity-80">{pageLabel}</p> : null}
          {source.snippet ? (
            <p className="text-[11px] leading-5 opacity-90">{source.snippet}</p>
          ) : null}
        </div>
      </PreviewCardContent>
    </PreviewCard>
  );
});

type SourceListProps = {
  sources: ChatSourceItem[];
};

export const SourceList = memo(function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((source, index) => (
        <SourceItem index={index} key={buildSourceItemKey(source, index)} source={source} />
      ))}
    </div>
  );
});
