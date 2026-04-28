/**
 * @file 聊天相关界面组件模块。
 */

import * as React from "react";
import { memo, useMemo, useState } from "react";
import { AlertTriangleIcon, PencilLineIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessageItem } from "../api/chat";
import { MessageStatus, isStreamingStatus } from "../constants";
const STATUS_TONE_TEXT_CLASS = {
  error: "text-destructive",
  pending: "text-primary",
  default: "text-muted-foreground",
} as const;

const STATUS_TONE_DOT_CLASS = {
  error: "bg-destructive",
  pending: "bg-primary",
  default: "bg-border",
} as const;

import { buildMessageRowModel } from "./build-message-row-model";
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
type MessageRowProps = {
  enableContainment?: boolean;
  isCompactLayout?: boolean;
  message: ChatMessageItem;
  onDeleteFailed?: (message: ChatMessageItem) => void;
  onEditFailed?: (message: ChatMessageItem) => void;
  onRetry: (message: ChatMessageItem) => void | Promise<void>;
};

/**
 * 消息恢复操作组件。
 * 在消息失败时显示重试、编辑、删除按钮。
 */
const RecoveryActions = memo(function RecoveryActions({
  canRetry,
  isUserMessage,
  onDeleteFailed,
  onEditFailed,
  onRetry,
}: {
  canRetry: boolean;
  isUserMessage: boolean;
  onDeleteFailed?: () => void;
  onEditFailed?: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("chat");
  const deleteLabel = t("deleteAction");
  const editLabel = t("editAction");
  const retryLabel = t("retryAction");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        isUserMessage ? "justify-end" : "justify-start",
      )}
    >
      {canRetry ? (
        <Button className="rounded-xl" onClick={onRetry} size="sm" type="button" variant="default">
          <RotateCcwIcon data-icon="inline-start" />
          {retryLabel}
        </Button>
      ) : null}
      {isUserMessage && (
        <>
          <Button
            className="rounded-xl"
            onClick={onEditFailed}
            size="sm"
            type="button"
            variant="secondary"
          >
            <PencilLineIcon data-icon="inline-start" />
            {editLabel}
          </Button>
          <Button
            className="rounded-xl text-muted-foreground hover:text-destructive"
            onClick={onDeleteFailed}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2Icon data-icon="inline-start" />
            {deleteLabel}
          </Button>
        </>
      )}
    </div>
  );
});

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
  const systemLabel = t("systemRole");
  const userLabel = t("userRole");
  const {
    assistantContent,
    canRetry,
    displayErrorMessage,
    isAssistantMessage,
    isUserMessage,
    messageLabelStyle,
    statusMeta,
  } = useMemo(() => buildMessageRowModel(message, t), [message, t]);
  const layoutMode = isCompactLayout ? "stacked" : "staggered";
  const messageSide = isUserMessage ? "end" : "start";
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const triggerRetry = () => {
    void Promise.resolve(onRetry(message)).catch(() => {});
  };
  const attachments = message.attachments ?? [];
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
  function resolveRoleLabel() {
    if (isAssistantMessage) return assistantLabel;
    if (isUserMessage) return userLabel;
    return systemLabel;
  }

  const roleLabel = resolveRoleLabel();
  const bubbleWidthMode = isUserMessage ? "fit" : "adaptive";

  const recoveryActions =
    message.status === MessageStatus.FAILED ? (
      <RecoveryActions
        canRetry={canRetry}
        isUserMessage={isUserMessage}
        onDeleteFailed={() => onDeleteFailed?.(message)}
        onEditFailed={() => onEditFailed?.(message)}
        onRetry={triggerRetry}
      />
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
        "flex w-full min-w-0 flex-col gap-2",
        isUserMessage ? "items-end" : "items-start",
        enableContainment ? "contain-layout contain-paint" : "",
        isCompactLayout
          ? "max-w-full"
          : cn(
              "max-w-[min(100%,42rem)]",
              isUserMessage ? "ml-auto pl-0 md:pl-8 xl:pl-14" : "mr-auto pr-0 md:pr-8 xl:pr-14",
            ),
      )}
      style={
        enableContainment ? { containIntrinsicSize: "220px", contentVisibility: "auto" } : undefined
      }
    >
      <div
        className={cn(
          "flex w-full flex-wrap items-center gap-1.5 px-1",
          isUserMessage ? "justify-end" : "justify-start",
        )}
      >
        {!isUserMessage ? (
          <Badge
            className={cn(
              "rounded-full px-2 py-[3px] text-[11px]",
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
            "inline-flex items-center gap-1.5 text-[11px] font-medium",
            STATUS_TONE_TEXT_CLASS[statusMeta.tone],
          )}
          data-message-status={message.status}
          data-message-status-tone={statusMeta.tone}
        >
          <span className={cn("size-1.5 rounded-full", STATUS_TONE_DOT_CLASS[statusMeta.tone])} />
          {statusMeta.label}
        </span>
        {isUserMessage ? (
          <Badge
            className="rounded-full px-2 py-[3px] text-[11px]"
            data-message-label-style={messageLabelStyle}
            variant="outline"
          >
            {roleLabel}
          </Badge>
        ) : null}
      </div>
      <div
        className={cn(
          "surface-elevated min-w-0 max-w-full overflow-hidden rounded-[22px] border border-border/44 shadow-[0_10px_28px_hsl(var(--foreground)/0.04)]",
          bubbleWidthMode === "adaptive" ? "w-full" : "w-fit",
          isUserMessage ? "border-primary/14 bg-secondary/[0.34]" : "bg-background/92",
        )}
        data-message-bubble-width={bubbleWidthMode}
        data-testid={`chat-message-bubble-${message.id}`}
      >
        <div className="space-y-3 px-3.5 py-3.5 md:px-4 md:py-4">
          {isAssistantMessage ? (
            <MarkdownMessage
              content={assistantContent}
              isStreaming={isStreamingStatus(message.status)}
              testId="chat-markdown-body"
            />
          ) : message.content.trim() ? (
            <p className="break-words whitespace-pre-wrap text-[14px] leading-6 text-foreground">
              {message.content}
            </p>
          ) : null}
        </div>

        {(message.sources ?? []).length ? (
          <div className="border-t border-border/52 px-3.5 py-3 md:px-4">
            <SourceList sources={message.sources ?? []} />
          </div>
        ) : null}

        {attachments.length ? (
          <div className="border-t border-border/52 px-3 py-3 md:px-3.5">
            <AttachmentList
              items={attachmentListItems}
              testId={`message-attachment-list-${message.id}`}
              variant="compact"
            />
          </div>
        ) : null}

        {displayErrorMessage || recoveryActions ? (
          <div
            className="border-t border-destructive/18 bg-destructive/[0.045] px-3.5 py-3 md:px-4"
            data-testid={`chat-message-recovery-${message.id}`}
          >
            <div className="flex flex-col gap-2.5">
              {displayErrorMessage ? (
                <div
                  className={cn(
                    "flex items-start gap-2",
                    isUserMessage
                      ? "flex-row-reverse justify-end text-right"
                      : "justify-start text-left",
                  )}
                >
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm leading-[1.375rem] text-destructive">
                    {displayErrorMessage}
                  </p>
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
  const lastMessageIdRef = React.useRef<number | null>(null);
  const [animatingMessageIds, setAnimatingMessageIds] = React.useState<Set<number>>(new Set());

  // 检测新消息并添加入场动画
  React.useEffect(() => {
    if (messages.length === 0) {
      lastMessageIdRef.current = null;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    const lastId = lastMessageIdRef.current;

    // 如果有新消息（ID 不同），添加动画
    if (lastId !== null && lastMessage.id !== lastId) {
      setAnimatingMessageIds((prev) => new Set([...prev, lastMessage.id]));

      // 动画结束后移除 ID
      const timer = setTimeout(() => {
        setAnimatingMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(lastMessage.id);
          return next;
        });
      }, 400);

      return () => clearTimeout(timer);
    }

    lastMessageIdRef.current = lastMessage.id;
  }, [messages]);

  // 初始加载时记录最后一条消息 ID
  React.useEffect(() => {
    if (messages.length > 0 && lastMessageIdRef.current === null) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        lastMessageIdRef.current = lastMessage.id;
      }
    }
  }, [messages]);

  return (
    <div
      className="flex flex-col gap-4"
      data-chat-contained={shouldContainMessages ? "true" : "false"}
    >
      {messages.map((message, index) => (
        <div
          key={message.id}
          className={animatingMessageIds.has(message.id) ? "animate-fade-in-up" : ""}
          style={
            animatingMessageIds.has(message.id)
              ? { animationDelay: `${Math.min(index * 0.05, 0.2)}s` }
              : undefined
          }
        >
          <MessageRow
            enableContainment={shouldContainMessages}
            isCompactLayout={isMobile}
            message={message}
            onDeleteFailed={onDeleteFailed}
            onEditFailed={onEditFailed}
            onRetry={onRetry}
          />
        </div>
      ))}
    </div>
  );
});
