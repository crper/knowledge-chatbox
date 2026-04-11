/**
 * @file 工作区相关界面组件模块。
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenTextIcon, ScanSearchIcon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { NavLink, useParams } from "@/lib/app-router";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatContextQueryOptions } from "@/features/chat/api/chat-query";
import { AttachmentList } from "@/features/chat/components/attachment-list";
import { ImageViewerDialog } from "@/features/chat/components/image-viewer-dialog";
import { parseChatSessionId } from "@/lib/routes";
import {
  buildAttachmentPreviewIndexes,
  buildChatAttachmentDescriptors,
  buildChatAttachmentListItems,
  buildChatImageViewerItems,
} from "@/features/chat/utils/attachment-list-items";
import { groupChatSources } from "@/features/chat/utils/group-chat-sources";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 渲染聊天资源面板。
 */
export function ChatResourcePanel({
  className,
  surface = "default",
}: {
  className?: string;
  surface?: "default" | "embedded";
}) {
  const { t } = useTranslation("chat");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const activeSessionId = parseChatSessionId(sessionIdParam);

  const contextQuery = useQuery(chatContextQueryOptions(activeSessionId));
  const context = contextQuery.data ?? null;
  const attachments = context?.attachments ?? [];
  const latestAssistantSources = context?.latest_assistant_sources ?? [];
  const attachmentDescriptors = useMemo(
    () => buildChatAttachmentDescriptors(attachments),
    [attachments],
  );
  const imageViewerItems = useMemo(
    () => buildChatImageViewerItems(attachmentDescriptors),
    [attachmentDescriptors],
  );
  const previewIndexes = useMemo(
    () => buildAttachmentPreviewIndexes(imageViewerItems),
    [imageViewerItems],
  );
  const attachmentListItems = useMemo(
    () =>
      buildChatAttachmentListItems({
        descriptors: attachmentDescriptors,
        onPreview: (attachmentId) => {
          const nextIndex = previewIndexes.get(attachmentId);
          if (typeof nextIndex === "number") {
            setViewerIndex(nextIndex);
          }
        },
      }),
    [attachmentDescriptors, previewIndexes],
  );
  const groupedSources = useMemo(
    () => groupChatSources(latestAssistantSources),
    [latestAssistantSources],
  );
  const hasAttachments = attachments.length > 0;
  const hasReferences = groupedSources.length > 0;
  const isOverviewOnly = !hasAttachments && !hasReferences;
  const statusLabel = hasReferences ? t("contextStatusReady") : t("contextStatusWaiting");
  const summaryDescription =
    hasAttachments || hasReferences ? t("contextReadyDescription") : t("contextEmptyDescription");

  return (
    <div
      className={cn(
        surface === "embedded"
          ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent px-2 py-2 sm:px-2.5 sm:py-2.5"
          : "surface-panel-subtle flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-3 sm:p-4",
        className,
      )}
    >
      <div className="space-y-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="surface-inline flex size-7 items-center justify-center rounded-xl text-primary/76">
            <BookOpenTextIcon aria-hidden="true" className="size-3.5" />
          </span>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground/92">
            {t("currentSessionResourcesTitle")}
          </CardTitle>
        </div>
        <CardDescription className="text-[11px] leading-relaxed text-muted-foreground/66">
          {t("currentSessionResourcesDescription")}
        </CardDescription>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        contentClassName="min-w-0 w-full"
        contentStyle={{ minWidth: 0, width: "100%" }}
        data-testid="chat-resource-panel-scroll-container"
        hideScrollbar
        viewportClassName="no-visible-scrollbar overflow-x-hidden"
        viewportStyle={{ overflowX: "hidden" }}
      >
        <div
          className={cn(
            "min-w-0 w-full max-w-full space-y-2.5 overflow-x-hidden pb-1 pr-0.5",
            isOverviewOnly ? "space-y-2.5" : "space-y-3",
          )}
        >
          <section className="surface-elevated min-w-0 max-w-full overflow-hidden rounded-[1.2rem] p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="surface-inline min-w-0 rounded-xl px-2.5 py-2">
                <p className="truncate text-[10px] text-muted-foreground/66">{t("resourcesTab")}</p>
                <p className="mt-1 text-[14px] font-semibold leading-tight text-foreground tabular-nums">
                  {t("contextAttachmentsCount", { count: attachments.length })}
                </p>
              </div>
              <div className="surface-inline min-w-0 rounded-xl px-2.5 py-2">
                <p className="truncate text-[10px] text-muted-foreground/66">
                  {t("referencesTab")}
                </p>
                <p className="mt-1 text-[14px] font-semibold leading-tight text-foreground tabular-nums">
                  {t("contextSourcesCount", { count: groupedSources.length })}
                </p>
              </div>
            </div>
            <div className="surface-inline mt-2 flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  hasReferences ? "bg-emerald-600/80" : "bg-muted-foreground/46",
                )}
              />
              <p className="truncate text-[11px] font-medium text-foreground/90">{statusLabel}</p>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground/74">
              {summaryDescription}
            </p>
            <NavLink
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "mt-2 h-8 w-full justify-center gap-1.5 overflow-hidden rounded-full px-2.5 text-[11px] font-medium active:scale-[0.98]",
              )}
              to="/knowledge"
            >
              <UploadIcon data-icon="inline-start" className="size-3 shrink-0" />
              <span className="truncate">{t("emptySessionResourceAction")}</span>
            </NavLink>
          </section>

          {!isOverviewOnly ? (
            <Accordion className="space-y-2" defaultValue={["attachments", "references"]} multiple>
              <AccordionItem
                className="surface-inline min-w-0 max-w-full overflow-hidden rounded-[1.2rem] border-0 p-3"
                value="attachments"
              >
                <AccordionTrigger className="flex min-w-0 items-center gap-2 py-0 hover:no-underline">
                  <span className="surface-embedded flex size-6 shrink-0 items-center justify-center rounded-md text-primary/72">
                    <BookOpenTextIcon aria-hidden="true" className="size-3" />
                  </span>
                  <p className="min-w-0 truncate text-[12px] font-semibold text-foreground/92">
                    {t("contextAttachmentsTitle")}
                  </p>
                </AccordionTrigger>
                <AccordionContent className="mt-2 pb-0">
                  {attachments.length === 0 ? (
                    <Empty className="min-w-0 rounded-lg border border-dashed border-border/60 bg-background/24 p-2.5">
                      <EmptyHeader>
                        <EmptyTitle className="text-[11px]">
                          {t("contextAttachmentsEmptyTitle")}
                        </EmptyTitle>
                        <EmptyDescription className="text-[10px] leading-relaxed text-muted-foreground/64">
                          {t("contextAttachmentsEmptyDescription")}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <AttachmentList
                      hideScrollbar
                      items={attachmentListItems}
                      key={activeSessionId ?? "idle"}
                      listMaxHeightClassName={groupedSources.length > 0 ? "max-h-28" : "max-h-36"}
                      testId="resource-attachment-list"
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                className="surface-inline min-w-0 max-w-full overflow-hidden rounded-[1.2rem] border-0 p-3"
                value="references"
              >
                <AccordionTrigger className="flex min-w-0 items-center gap-2 py-0 hover:no-underline">
                  <span className="surface-embedded flex size-6 shrink-0 items-center justify-center rounded-md text-primary/72">
                    <ScanSearchIcon aria-hidden="true" className="size-3" />
                  </span>
                  <p className="min-w-0 truncate text-[12px] font-semibold text-foreground/92">
                    {t("contextReferencesTitle")}
                  </p>
                </AccordionTrigger>
                <AccordionContent className="mt-2 pb-0">
                  {groupedSources.length === 0 ? (
                    <Empty className="min-w-0 rounded-lg border border-dashed border-border/60 bg-background/24 p-2.5">
                      <EmptyHeader>
                        <EmptyTitle className="text-[11px]">
                          {t("contextReferencesEmptyTitle")}
                        </EmptyTitle>
                        <EmptyDescription className="text-[10px] leading-relaxed text-muted-foreground/64">
                          {t("contextReferencesEmptyDescription")}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="surface-embedded min-w-0 max-w-full overflow-hidden rounded-xl">
                      <div className="min-w-0 max-h-44 divide-y divide-border/48 overflow-x-hidden overflow-y-auto no-visible-scrollbar">
                        {groupedSources.map((group) => (
                          <article key={group.key} className="min-w-0 px-2.5 py-2.5">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="truncate text-[12px] font-medium leading-snug text-foreground">
                                  {group.title}
                                </p>
                              </div>
                              <Badge
                                className="shrink-0 border-border/48 px-2 text-[10px]"
                                variant="outline"
                              >
                                {t("contextSourceHitsCount", { count: group.count })}
                              </Badge>
                            </div>
                            <div className="mt-1.5 space-y-1.5">
                              {group.snippets.map((snippet, index) => (
                                <p
                                  key={`${group.key}-${index}`}
                                  className="line-clamp-3 border-l border-border/52 pl-2 text-[11px] leading-5 text-muted-foreground/72 break-words"
                                >
                                  {snippet}
                                </p>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </div>
      </ScrollArea>

      <ImageViewerDialog
        initialIndex={viewerIndex ?? 0}
        items={imageViewerItems}
        onOpenChange={(open) => {
          if (!open) {
            setViewerIndex(null);
          }
        }}
        open={viewerIndex !== null && imageViewerItems.length > 0}
      />
    </div>
  );
}
