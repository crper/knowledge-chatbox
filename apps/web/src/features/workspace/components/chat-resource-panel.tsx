/**
 * @file 工作区相关界面组件模块。
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenTextIcon, ScanSearchIcon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { NavLink, useParams } from "@/lib/app-router";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatContextQueryOptions } from "@/features/chat/api/chat-query";
import { AttachmentList } from "@/features/chat/components/attachment-list";
import { ImageViewerDialog } from "@/features/chat/components/image-viewer-dialog";
import { parseChatSessionId } from "@/features/chat/utils/chat-session-route";
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
  headerAccessory,
  surface = "default",
}: {
  className?: string;
  headerAccessory?: ReactNode;
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
  const isOverviewOnly = attachments.length === 0 && groupedSources.length === 0;

  return (
    <div
      className={cn(
        surface === "embedded"
          ? "flex h-full min-h-0 min-w-0 flex-col bg-transparent px-4 py-4"
          : "surface-panel-subtle flex h-full min-h-0 min-w-0 flex-col rounded-2xl p-4",
        className,
      )}
    >
      <div className="space-y-1 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="surface-inline flex size-8 items-center justify-center rounded-xl text-primary/78">
              <BookOpenTextIcon aria-hidden="true" className="size-3.5" />
            </span>
            <CardTitle className="text-sm font-semibold tracking-tight">
              {t("currentSessionResourcesTitle")}
            </CardTitle>
          </div>
          {headerAccessory}
        </div>
        <CardDescription className="text-xs text-muted-foreground/64">
          {t("currentSessionResourcesDescription")}
        </CardDescription>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        data-testid="chat-resource-panel-scroll-container"
      >
        <div className={cn("min-w-full pb-1 pr-0.5", isOverviewOnly ? "space-y-3" : "space-y-6")}>
          <section className="surface-inline rounded-2xl p-3.5">
            <div className="grid gap-2 sm:grid-cols-3">
              <Badge
                className="justify-center border-border/48 text-[11px] sm:justify-start"
                variant="outline"
              >
                {t("contextAttachmentsCount", { count: attachments.length })}
              </Badge>
              <Badge
                className="justify-center border-border/48 text-[11px] sm:justify-start"
                variant="outline"
              >
                {t("contextSourcesCount", { count: groupedSources.length })}
              </Badge>
              <Badge
                className="justify-center text-[11px] sm:justify-start sm:col-span-3"
                variant={groupedSources.length > 0 ? "secondary" : "outline"}
              >
                {groupedSources.length > 0 ? t("contextStatusReady") : t("contextStatusWaiting")}
              </Badge>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground/76">
              {groupedSources.length > 0 || attachments.length > 0
                ? t("contextReadyDescription")
                : t("contextEmptyDescription")}
            </p>
            <NavLink
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "mt-3.5 h-8 justify-start text-xs",
              )}
              to="/knowledge"
            >
              <UploadIcon data-icon="inline-start" className="size-3.5" />
              {t("emptySessionResourceAction")}
            </NavLink>
          </section>

          {!isOverviewOnly ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="surface-inline flex size-7 items-center justify-center rounded-lg text-primary/72">
                    <BookOpenTextIcon aria-hidden="true" className="size-3" />
                  </span>
                  <p className="text-[13px] font-medium text-foreground">
                    {t("contextAttachmentsTitle")}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground/56 pl-9">
                  {t("contextAttachmentsDescription")}
                </p>
              </div>
              {attachments.length === 0 ? (
                <Empty className="bg-background/28 rounded-xl p-3">
                  <EmptyHeader>
                    <EmptyTitle className="text-xs">{t("contextAttachmentsEmptyTitle")}</EmptyTitle>
                    <EmptyDescription className="text-[11px] leading-relaxed text-muted-foreground/64">
                      {t("contextAttachmentsEmptyDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <AttachmentList
                  key={activeSessionId ?? "idle"}
                  items={attachmentListItems}
                  testId="resource-attachment-list"
                />
              )}
            </section>
          ) : null}

          {!isOverviewOnly ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="surface-inline flex size-7 items-center justify-center rounded-lg text-primary/72">
                    <ScanSearchIcon aria-hidden="true" className="size-3" />
                  </span>
                  <p className="text-[13px] font-medium text-foreground">
                    {t("contextReferencesTitle")}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground/56 pl-9">
                  {t("contextReferencesDescription")}
                </p>
              </div>
              {groupedSources.length === 0 ? (
                <Empty className="bg-background/28 rounded-xl p-3">
                  <EmptyHeader>
                    <EmptyTitle className="text-xs">{t("contextReferencesEmptyTitle")}</EmptyTitle>
                    <EmptyDescription className="text-[11px] leading-relaxed text-muted-foreground/64">
                      {t("contextReferencesEmptyDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-2">
                  {groupedSources.map((group) => (
                    <div key={group.key} className="surface-inline rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[13px] font-medium leading-snug text-foreground">
                            {group.title}
                          </p>
                        </div>
                        <Badge className="shrink-0 border-border/48 text-[10px]" variant="outline">
                          {t("contextSourceHitsCount", { count: group.count })}
                        </Badge>
                      </div>
                      {group.snippets.map((snippet, index) => (
                        <p
                          key={`${group.key}-${index}`}
                          className="mt-1.5 break-words text-[12px] leading-relaxed text-muted-foreground/70"
                        >
                          {snippet}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
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
