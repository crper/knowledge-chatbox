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
import { getChatMessages } from "@/features/chat/api/chat";
import { AttachmentList } from "@/features/chat/components/attachment-list";
import {
  ImageViewerDialog,
  type ImageViewerItem,
} from "@/features/chat/components/image-viewer-dialog";
import { parseChatSessionId } from "@/features/chat/utils/chat-session-route";
import { buildChatAttachmentDescriptors } from "@/features/chat/utils/attachment-list-items";
import { collectAttachments } from "@/features/chat/utils/collect-attachments";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { groupChatSources } from "@/features/chat/utils/group-chat-sources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/api/query-keys";
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

  const messagesQuery = useQuery({
    enabled: activeSessionId !== null,
    queryKey:
      activeSessionId === null
        ? (["chat-resource-panel", "idle"] as const)
        : queryKeys.chat.messages(activeSessionId),
    queryFn: async () => {
      if (activeSessionId === null) {
        return [];
      }
      return getChatMessages(activeSessionId);
    },
  });

  const messages = Array.isArray(messagesQuery.data) ? messagesQuery.data : [];
  const attachments = useMemo(() => collectAttachments(messages), [messages]);
  const attachmentDescriptors = useMemo(
    () => buildChatAttachmentDescriptors(attachments),
    [attachments],
  );
  const imageViewerItems = useMemo<ImageViewerItem[]>(
    () =>
      attachmentDescriptors
        .filter((descriptor) => descriptor.kind === "image" && descriptor.previewable)
        .map((descriptor) => ({
          kind: "remote",
          id: descriptor.id,
          displayName: descriptor.displayName,
          name: descriptor.attachment.name,
          mimeType: descriptor.attachment.mime_type,
          originalUrl: getDocumentFileUrl(descriptor.attachment.resource_document_version_id ?? 0),
          resourceDocumentVersionId: descriptor.attachment.resource_document_version_id ?? 0,
        })),
    [attachmentDescriptors],
  );
  const previewIndexes = useMemo(
    () => new Map(imageViewerItems.map((item, index) => [item.id, index])),
    [imageViewerItems],
  );
  const attachmentListItems = useMemo(
    () =>
      attachmentDescriptors.map((descriptor) => ({
        displayName: descriptor.displayName,
        id: descriptor.id,
        kind: descriptor.kind,
        onPreview: descriptor.previewable
          ? () => {
              const nextIndex = previewIndexes.get(descriptor.id);
              if (typeof nextIndex === "number") {
                setViewerIndex(nextIndex);
              }
            }
          : undefined,
        previewable: descriptor.previewable,
        rawName: descriptor.rawName,
      })),
    [attachmentDescriptors, previewIndexes],
  );
  const latestAssistantSources = useMemo(
    () =>
      [...messages].reverse().find((message) => message.role === "assistant")?.sources_json ?? [],
    [messages],
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
          : "surface-panel-subtle flex h-full min-h-0 min-w-0 flex-col rounded-[1.5rem] p-4",
        className,
      )}
    >
      <div className="space-y-1 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="surface-icon flex size-9 items-center justify-center rounded-2xl text-primary">
              <BookOpenTextIcon aria-hidden="true" className="size-4" />
            </span>
            <CardTitle>{t("currentSessionResourcesTitle")}</CardTitle>
          </div>
          {headerAccessory}
        </div>
        <CardDescription>{t("currentSessionResourcesDescription")}</CardDescription>
      </div>

      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto pr-3"
        data-testid="chat-resource-panel-scroll-container"
      >
        <div className={cn("min-w-full pb-1 pr-1", isOverviewOnly ? "space-y-4" : "space-y-8")}>
          <section className="surface-panel rounded-[1.75rem] p-4">
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
            <Button asChild className="mt-4 justify-start" size="sm" variant="outline">
              <NavLink to="/knowledge">
                <UploadIcon data-icon="inline-start" />
                {t("emptySessionResourceAction")}
              </NavLink>
            </Button>
          </section>

          {!isOverviewOnly ? (
            <section className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="surface-icon flex size-8 items-center justify-center rounded-xl text-primary">
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
                  <span className="surface-icon flex size-8 items-center justify-center rounded-xl text-primary">
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
                    <div key={group.key} className="surface-outline rounded-2xl p-4">
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
      </div>
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
