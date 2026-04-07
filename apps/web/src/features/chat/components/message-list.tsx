/**
 * @file 聊天相关界面组件模块。
 */

import { memo, useMemo, useState } from "react";
import { AlertTriangleIcon, PencilLineIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessageItem } from "../api/chat";
import { MessageRole, MessageStatus, isStreamingStatus } from "../constants";
import {
  buildAttachmentPreviewIndexes,
  buildChatAttachmentDescriptors,
  buildChatAttachmentListItems,
  buildChatImageViewerItems,
} from "../utils/attachment-list-items";
import { AttachmentList } from "./attachment-list";
import { ImageViewerDialog } from "./image-viewer-dialog";
import { MarkdownMessage } from "./markdown-message";
import { SourceList } from "./source-list";

type MessageListProps = {
  messages: ChatMessageItem[];
  onDeleteFailed?: (message: ChatMessageItem) => void;
  onEditFailed?: (message: ChatMessageItem) => void;
  onRetry: (message: ChatMessageItem) => void | Promise<void>;
};

const MESSAGE_CONTAINMENT_THRESHOLD = 80;
const IMAGE_ATTACHMENT_ERROR_PATTERNS = [
  /attached image could not be processed/i,
  /failed to process inputs:\s*image/i,
  /image:\s*unknown format/i,
] as const;

function getUserFacingMessageError(message: ChatMessageItem, fallbackT: (key: string) => string) {
  const rawErrorMessage = message.error_message?.trim();
  if (!rawErrorMessage) {
    return null;
  }

  const hasImageAttachment = (message.attachments_json ?? []).some(
    (attachment) => attachment.type === "image",
  );
  if (
    hasImageAttachment &&
    IMAGE_ATTACHMENT_ERROR_PATTERNS.some((pattern) => pattern.test(rawErrorMessage))
  ) {
    return fallbackT("attachmentImageProcessingFailed");
  }

  return rawErrorMessage;
}

export type MessageRowProps = {
  enableContainment?: boolean;
  isCompactLayout?: boolean;
  message: ChatMessageItem;
  onDeleteFailed?: (message: ChatMessageItem) => void;
  onEditFailed?: (message: ChatMessageItem) => void;
  onRetry: (message: ChatMessageItem) => void | Promise<void>;
};

export const MessageRow = memo(function MessageRow({
  enableContainment = false,
  isCompactLayout = false,
  message,
  onDeleteFailed,
  onEditFailed,
  onRetry,
}: MessageRowProps) {
  const { t } = useTranslation("chat");
  const assistantLabel = t("assistantRole");
  const deleteLabel = t("deleteAction");
  const editLabel = t("editAction");
  const retryLabel = t("retryAction");
  const systemLabel = t("systemRole", { defaultValue: "系统" });
  const userLabel = t("userRole");
  const isUserMessage = message.role === MessageRole.USER;
  const isAssistantMessage = message.role === MessageRole.ASSISTANT;
  const layoutMode = isCompactLayout ? "stacked" : "staggered";
  const messageSide = isUserMessage ? "end" : "start";
  const messageLabelStyle = message.role === MessageRole.ASSISTANT ? "badge" : "tag";
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const canRetry =
    message.status === MessageStatus.FAILED &&
    (isUserMessage || message.reply_to_message_id != null);
  const triggerRetry = () => {
    void Promise.resolve(onRetry(message)).catch(() => {});
  };
  const assistantContent =
    message.content.trim().length > 0
      ? message.content
      : message.status === MessageStatus.FAILED
        ? t("assistantFailedFallback")
        : t("assistantStreamingFallback");
  const displayErrorMessage = useMemo(() => {
    return getUserFacingMessageError(message, t);
  }, [message, t]);
  const attachments = message.attachments_json ?? [];
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
  const roleLabel = isAssistantMessage ? assistantLabel : isUserMessage ? userLabel : systemLabel;
  const bubbleWidthMode = isUserMessage ? "fit" : "adaptive";
  const statusMeta =
    message.status === MessageStatus.FAILED
      ? {
          label: isUserMessage ? t("messageStatusUserFailed") : t("messageStatusAssistantFailed"),
          tone: "error" as const,
        }
      : isAssistantMessage && isStreamingStatus(message.status)
        ? {
            label: t("assistantStreamingStatus"),
            tone: "pending" as const,
          }
        : {
            label: isUserMessage
              ? t("messageStatusUserReady")
              : isAssistantMessage
                ? t("messageStatusAssistantReady")
                : t("messageStatusSystemReady", { defaultValue: "系统消息" }),
            tone: "default" as const,
          };
  const recoveryActions =
    message.status === MessageStatus.FAILED ? (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          isUserMessage ? "justify-end" : "justify-start",
        )}
      >
        {canRetry ? (
          <Button onClick={triggerRetry} size="sm" type="button" variant="default">
            <RotateCcwIcon data-icon="inline-start" />
            {retryLabel}
          </Button>
        ) : null}
        {isUserMessage ? (
          <Button
            onClick={() => onEditFailed?.(message)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <PencilLineIcon data-icon="inline-start" />
            {editLabel}
          </Button>
        ) : null}
        {isUserMessage ? (
          <Button
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDeleteFailed?.(message)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2Icon data-icon="inline-start" />
            {deleteLabel}
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div
      data-chat-contained={enableContainment ? "true" : undefined}
      data-message-layout={layoutMode}
      data-message-side={messageSide}
      data-message-text-align={messageSide}
      data-message-width={isCompactLayout ? "full" : "adaptive"}
      data-testid={`chat-message-row-${message.id}`}
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5",
        isUserMessage ? "items-end" : "items-start",
        enableContainment ? "contain-layout contain-paint" : "",
        isCompactLayout
          ? "max-w-full"
          : cn(
              "max-w-[min(100%,44rem)]",
              isUserMessage ? "ml-auto pl-0 md:pl-8 xl:pl-14" : "mr-auto pr-0 md:pr-8 xl:pr-14",
            ),
      )}
      style={
        enableContainment ? { containIntrinsicSize: "220px", contentVisibility: "auto" } : undefined
      }
    >
      <div
        className={cn(
          "flex w-full flex-wrap items-center gap-2 px-1",
          isUserMessage ? "justify-end" : "justify-start",
        )}
      >
        {!isUserMessage ? (
          <Badge
            className={cn(
              "rounded-full px-2.5 py-1 text-ui-caption",
              isAssistantMessage ? "bg-secondary/80" : "bg-muted/62 text-foreground/82",
            )}
            data-message-label-style={messageLabelStyle}
            variant={isAssistantMessage ? "secondary" : "outline"}
          >
            {roleLabel}
          </Badge>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-2 text-ui-caption font-medium",
            statusMeta.tone === "error"
              ? "text-destructive"
              : statusMeta.tone === "pending"
                ? "text-primary"
                : "text-muted-foreground",
          )}
          data-message-status={message.status}
          data-message-status-tone={statusMeta.tone}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              statusMeta.tone === "error"
                ? "bg-destructive"
                : statusMeta.tone === "pending"
                  ? "bg-primary"
                  : "bg-border",
            )}
          />
          {statusMeta.label}
        </span>
        {isUserMessage ? (
          <Badge
            className="rounded-full px-2.5 py-1 text-ui-caption"
            data-message-label-style={messageLabelStyle}
            variant="outline"
          >
            {roleLabel}
          </Badge>
        ) : null}
      </div>
      <div
        className={cn(
          "surface-elevated min-w-0 max-w-full overflow-hidden rounded-2xl",
          bubbleWidthMode === "adaptive" ? "w-full" : "w-fit",
          isUserMessage ? "border-primary/16" : "",
        )}
        data-message-bubble-width={bubbleWidthMode}
        data-testid={`chat-message-bubble-${message.id}`}
      >
        <div className="space-y-3.5 px-4 py-4.5 md:px-5 md:py-5">
          {isAssistantMessage ? (
            <MarkdownMessage
              content={assistantContent}
              isStreaming={isStreamingStatus(message.status)}
              testId="chat-markdown-body"
            />
          ) : message.content.trim() ? (
            <p className="text-ui-body break-words whitespace-pre-wrap text-foreground">
              {message.content}
            </p>
          ) : null}
        </div>

        {(message.sources_json ?? []).length ? (
          <div className="border-t border-border/60 px-4 py-3 md:px-5">
            <SourceList sources={message.sources_json ?? []} />
          </div>
        ) : null}

        {attachments.length ? (
          <div className="border-t border-border/60 px-4 py-3 md:px-5">
            <AttachmentList
              items={attachmentListItems}
              testId={`message-attachment-list-${message.id}`}
            />
          </div>
        ) : null}

        {displayErrorMessage || recoveryActions ? (
          <div
            className="border-t border-destructive/18 bg-destructive/[0.045] px-4 py-3 md:px-5"
            data-testid={`chat-message-recovery-${message.id}`}
          >
            <div className="flex flex-col gap-3">
              {displayErrorMessage ? (
                <div
                  className={cn(
                    "flex items-start gap-2.5",
                    isUserMessage
                      ? "flex-row-reverse justify-end text-right"
                      : "justify-start text-left",
                  )}
                >
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm leading-6 text-destructive">{displayErrorMessage}</p>
                </div>
              ) : null}
              {recoveryActions}
            </div>
          </div>
        ) : null}
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
});

/**
 * 渲染聊天消息列表。
 */
export const MessageList = memo(function MessageList({
  messages,
  onDeleteFailed,
  onEditFailed,
  onRetry,
}: MessageListProps) {
  const isMobile = useIsMobile();
  const shouldContainMessages = messages.length >= MESSAGE_CONTAINMENT_THRESHOLD;

  return (
    <div
      className="flex flex-col gap-5"
      data-chat-contained={shouldContainMessages ? "true" : "false"}
    >
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          enableContainment={shouldContainMessages}
          isCompactLayout={isMobile}
          message={message}
          onDeleteFailed={onDeleteFailed}
          onEditFailed={onEditFailed}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
});
