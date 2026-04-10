import { memo } from "react";
import { FileSearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";

type SourceItem = {
  chunk_id: string;
  document_name?: string;
  section_title?: string;
  page_number?: number;
  snippet?: string;
};

type SourceItemProps = {
  index: number;
  source: SourceItem;
  t: ReturnType<typeof useTranslation>["t"];
};

const SourceItem = memo(function SourceItem({ index, source, t }: SourceItemProps) {
  const title = source.document_name ?? source.section_title ?? source.chunk_id;
  const pageLabel =
    source.page_number != null ? t("sourcePage", { page: source.page_number }) : null;

  return (
    <PreviewCard key={source.chunk_id}>
      <PreviewCardTrigger
        delay={200}
        render={
          <Button
            aria-label={t("sourceReferenceAction", {
              defaultValue: "查看引用 {{index}}",
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
  sources: SourceItem[];
};

export const SourceList = memo(function SourceList({ sources }: SourceListProps) {
  const { t } = useTranslation("chat");

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((source, index) => (
        <SourceItem index={index} key={source.chunk_id} source={source} t={t} />
      ))}
    </div>
  );
});
