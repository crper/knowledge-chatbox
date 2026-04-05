/**
 * @file 工作区相关界面组件模块。
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenTextIcon, ScanSearchIcon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useParams } from "react-router-dom";

import { CardDescription, CardTitle } from "@/components/ui/card";
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
          ? "flex h-full min-h-0 min-w-0 flex-col bg-transparent px-5 py-5"
          : "surface-panel-subtle flex h-full min-h-0 min-w-0 flex-col rounded-2xl p-4",
        className,
      )}
    >
      <div className="space-y-1 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="surface-light flex size-9 items-center justify-center rounded-2xl text-primary">
              <BookOpenTextIcon aria-hidden="true" className="size-4" />
            </span>
            <CardTitle>{t("currentSessionResourcesTitle")}</CardTitle>
          </div>
          {headerAccessory}
        </div>
        <CardDescription>{t("currentSessionResourcesDescription")}</CardDescription>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        data-testid="chat-resource-panel-scroll-container"
      >
        <div className={cn("min-w-full pb-1 pr-1", isOverviewOnly ? "space-y-4" : "space-y-8")}>
          <section className="surface-panel rounded-3xl p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Badge className="justify-center sm:justify-start" variant="outline">
                {t("contextAttachmentsCount", { count: attachments.length })}
              </Badge>
              <Badge className="justify-center sm:justify-start" variant="outline">
                {t("contextSourcesCount", { count: groupedSources.length })}
              </Badge>
              <Badge
                className="justify-center sm:justify-start sm:col-span-3"
                variant={groupedSources.length > 0 ? "secondary" : "outline"}
              >
                {groupedSources.length > 0 ? t("contextStatusReady") : t("contextStatusWaiting")}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {groupedSources.length > 0 || attachments.length > 0
                ? t("contextReadyDescription")
                : t("contextEmptyDescription")}
            </p>
            <NavLink
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "mt-4 justify-start",
              )}
              to="/knowledge"
            >
              <UploadIcon data-icon="inline-start" />
              {t("emptySessionResourceAction")}
            </NavLink>
          </section>

          {!isOverviewOnly ? (
            <section className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="surface-light flex size-8 items-center justify-center rounded-xl text-primary">
                    <BookOpenTextIcon aria-hidden="true" className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {t("contextAttachmentsTitle")}
                  </p>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("contextAttachmentsDescription")}
                </p>
              </div>
              {attachments.length === 0 ? (
                <Empty className="bg-background/40 p-4">
                  <EmptyHeader>
                    <EmptyTitle>{t("contextAttachmentsEmptyTitle")}</EmptyTitle>
                    <EmptyDescription>{t("contextAttachmentsEmptyDescription")}</EmptyDescription>
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
            <section className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="surface-light flex size-8 items-center justify-center rounded-xl text-primary">
                    <ScanSearchIcon aria-hidden="true" className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {t("contextReferencesTitle")}
                  </p>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("contextReferencesDescription")}
                </p>
              </div>
              {groupedSources.length === 0 ? (
                <Empty className="bg-background/40 p-4">
                  <EmptyHeader>
                    <EmptyTitle>{t("contextReferencesEmptyTitle")}</EmptyTitle>
                    <EmptyDescription>{t("contextReferencesEmptyDescription")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-2.5">
                  {groupedSources.map((group) => (
                    <div key={group.key} className="surface-light rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-foreground">{group.title}</p>
                        </div>
                        <Badge className="shrink-0" variant="outline">
                          {t("contextSourceHitsCount", { count: group.count })}
                        </Badge>
                      </div>
                      {group.snippets.map((snippet, index) => (
                        <p
                          key={`${group.key}-${index}`}
                          className="mt-2 break-words text-sm leading-6 text-muted-foreground"
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
