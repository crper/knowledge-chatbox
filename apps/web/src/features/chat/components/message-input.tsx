/**
 * @file 聊天相关界面组件模块。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { Button } from "@/components/ui/button";
import { isInputComposing } from "@/lib/dom";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatReasoningMode } from "../api/chat";
import type { ChatSendShortcut, ComposerAttachmentItem } from "../store/chat-composer-store";
import {
  buildAttachmentPreviewIndexes,
  buildComposerAttachmentListItems,
  buildComposerImageViewerItems,
} from "../utils/attachment-list-items";
import { ImageViewerDialog } from "./image-viewer-dialog";
import { MessageInputActionRail } from "./message-input-action-rail";
import { MessageInputAttachments } from "./message-input-attachments";

type MessageInputProps = {
  activeModelActionLabel?: string | null;
  onActiveModelAction?: () => void;
  activeModelLabel?: string | null;
  attachmentScopeHint?: string | null;
  attachments?: ComposerAttachmentItem[];
  draft: string;
  onAttachFiles?: (files: File[]) => void;
  onChange: (value: string) => void;
  onRejectFiles?: (fileRejections: FileRejection[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onReasoningModeChange?: (mode: ChatReasoningMode) => void;
  onStopSubmit?: () => void;
  onSubmit: () => void | Promise<void>;
  reasoningMode?: ChatReasoningMode;
  reasoningModeVisible?: boolean;
  sendShortcut: ChatSendShortcut;
  submitPending?: boolean;
};

const PASTED_FILE_NAME_FALLBACK = "pasted-image";

/** 根据 MIME 类型获取文件扩展名 */
function getPastedFileExtension(file: File): string {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

/** 规范化剪贴板文件（为无名文件生成默认名称） */
function normalizeClipboardFile(file: File): File {
  if (file.name.trim()) return file;

  const extension = getPastedFileExtension(file);
  return new File([file], `${PASTED_FILE_NAME_FALLBACK}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/** 从剪贴板事件中提取文件 */
function getClipboardFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const items = Array.from(event.clipboardData.items);
  const filesFromItems = items
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)
    .map(normalizeClipboardFile);

  if (filesFromItems.length > 0) return filesFromItems;

  return Array.from(event.clipboardData.files).map(normalizeClipboardFile);
}

/** 获取附件状态显示文本 */
function useAttachmentStatusLabels() {
  const { t } = useTranslation("chat");

  return useMemo(
    () => ({
      uploading: (progress: number | undefined) =>
        `${t("attachmentUploadingStatus")} ${progress ?? 0}%`,
      uploaded: t("attachmentUploadedStatus"),
      failed: t("attachmentFailedStatus"),
      queued: t("attachmentQueuedStatus"),
    }),
    [t],
  );
}

/**
 * 渲染聊天输入与发送区域。
 */
export function MessageInput({
  activeModelActionLabel = null,
  activeModelLabel = null,
  attachmentScopeHint = null,
  attachments = [],
  draft,
  onActiveModelAction,
  onAttachFiles,
  onChange,
  onRejectFiles,
  onRemoveAttachment,
  onReasoningModeChange,
  onStopSubmit,
  onSubmit,
  reasoningMode = "default",
  reasoningModeVisible = false,
  sendShortcut,
  submitPending = false,
}: MessageInputProps) {
  const { t } = useTranslation("chat");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const statusLabels = useAttachmentStatusLabels();

  const reasoningLabels = useMemo(
    () => ({
      label: t("reasoningModeLabel"),
      default: t("reasoningModeDefaultOption"),
      off: t("reasoningModeOffOption"),
      on: t("reasoningModeOnOption"),
    }),
    [t],
  );
  const stopSubmitLabel = t("stopStreamingAction");
  const sendLabel = t("sendAction");

  const hasSendableAttachment = attachments.some((attachment) => attachment.status !== "failed");
  const canSubmit = (draft.trim().length > 0 || hasSendableAttachment) && !submitPending;

  const imageViewerItems = useMemo(() => buildComposerImageViewerItems(attachments), [attachments]);
  const previewIndexes = useMemo(
    () => buildAttachmentPreviewIndexes(imageViewerItems),
    [imageViewerItems],
  );

  const attachmentListItems = useMemo(() => {
    const getStatusLabel = (attachment: ComposerAttachmentItem) => {
      switch (attachment.status) {
        case "uploading":
          return statusLabels.uploading(attachment.progress);
        case "uploaded":
          return statusLabels.uploaded;
        case "failed":
          return statusLabels.failed;
        default:
          return statusLabels.queued;
      }
    };

    return buildComposerAttachmentListItems({
      attachments,
      getStatusLabel,
      onPreview: (attachmentId) => {
        const index = previewIndexes.get(attachmentId);
        if (typeof index === "number") setViewerIndex(index);
      },
      onRemove: onRemoveAttachment,
    });
  }, [attachments, onRemoveAttachment, previewIndexes, statusLabels]);

  const triggerSubmit = useCallback(() => {
    void Promise.resolve(onSubmit()).catch(() => {});
  }, [onSubmit]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (canSubmit) triggerSubmit();
    },
    [canSubmit, triggerSubmit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isInputComposing(event)) return;

      const shouldSubmit =
        sendShortcut === "enter"
          ? event.key === "Enter" && !event.shiftKey
          : event.key === "Enter" && event.shiftKey;

      if (!shouldSubmit) return;

      event.preventDefault();
      if (canSubmit) triggerSubmit();
    },
    [canSubmit, sendShortcut, triggerSubmit],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = getClipboardFiles(event);
      if (files.length === 0) return;

      event.preventDefault();
      onAttachFiles?.(files);
    },
    [onAttachFiles],
  );

  const blurTextareaIfFocused = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.activeElement === textareaRef.current) {
      textareaRef.current?.blur();
    }
  }, []);

  const attachmentErrors = useMemo(
    () =>
      attachments.flatMap((attachment) =>
        attachment.errorMessage ? [attachment.errorMessage] : [],
      ),
    [attachments],
  );

  return (
    <FileDropzone
      disabled={submitPending}
      onFilesAccepted={onAttachFiles}
      onFilesRejected={onRejectFiles}
    >
      {({ getInputProps, getRootProps, isDragAccept, isDragActive, isDragReject, open }) => (
        <form className="space-y-2.5" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-message">
            {t("messageInputLabel")}
          </label>
          <div
            {...getRootProps({
              className: cn(
                "surface-elevated rounded-xl p-2 transition-[color,border-color,background,box-shadow] duration-200 ease-out sm:rounded-xl sm:p-2.5",
                isDragActive &&
                  "border-primary/36 bg-primary/6 scale-[1.004] shadow-[0_14px_32px_-18px_hsl(var(--primary)/0.16)]",
                isDragAccept &&
                  "border-primary/44 bg-primary/8 scale-[1.006] shadow-[0_16px_36px_-20px_hsl(var(--primary)/0.2)]",
                isDragReject && "border-destructive/38 bg-destructive/8 scale-[0.998]",
              ),
              "data-testid": "message-input-shell",
            })}
          >
            <input {...getInputProps({ "aria-label": t("attachResourceAction") })} />

            <MessageInputAttachments
              attachmentErrors={attachmentErrors}
              attachmentScopeHint={attachmentScopeHint}
              items={attachmentListItems}
            />

            {/* 模型操作提示 */}
            {activeModelActionLabel && (
              <div className="surface-light flex items-center gap-2.5 rounded-xl px-3 py-2">
                <span className="text-ui-caption text-muted-foreground">
                  {t("providerSetupInlineHint")}
                </span>
                <Button
                  className="h-auto px-0 text-ui-caption"
                  onClick={onActiveModelAction}
                  size="xs"
                  type="button"
                  variant="link"
                >
                  {activeModelActionLabel}
                </Button>
              </div>
            )}

            {/* 拖拽状态提示 */}
            {isDragActive && (
              <p
                className={cn(
                  "mb-3 px-1 text-ui-caption",
                  isDragReject ? "text-destructive" : "text-primary",
                )}
              >
                {isDragReject ? t("attachmentDropRejectHint") : t("attachmentDropActiveHint")}
              </p>
            )}

            {/* 文本输入区 */}
            <div
              className={cn("min-w-0", attachments.length > 0 && "mt-3")}
              data-testid="message-input-body"
            >
              <Textarea
                aria-label={t("messageInputLabel")}
                className="text-ui-body min-h-20 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none placeholder:text-sm placeholder:leading-7 placeholder:text-muted-foreground/85 focus-visible:ring-0 focus-visible:outline-none sm:min-h-24 sm:px-2.5 sm:py-2 sm:placeholder:text-ui-caption"
                disabled={submitPending}
                id="chat-message"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t("messageInputPlaceholder")}
                ref={textareaRef}
                value={draft}
              />
            </div>

            <MessageInputActionRail
              activeModelActionLabel={activeModelActionLabel}
              activeModelLabel={activeModelLabel}
              canSubmit={canSubmit}
              onActionPointerDown={blurTextareaIfFocused}
              onActiveModelAction={onActiveModelAction}
              onOpenAttachments={open}
              onReasoningModeChange={onReasoningModeChange}
              onStopSubmit={onStopSubmit}
              reasoningLabels={reasoningLabels}
              reasoningMode={reasoningMode}
              reasoningModeVisible={reasoningModeVisible}
              sendLabel={sendLabel}
              stopSubmitLabel={stopSubmitLabel}
              submitPending={submitPending}
            />
          </div>

          {/* 图片查看器 */}
          <ImageViewerDialog
            initialIndex={viewerIndex ?? 0}
            items={imageViewerItems}
            onOpenChange={(open) => {
              if (!open) setViewerIndex(null);
            }}
            open={viewerIndex !== null && imageViewerItems.length > 0}
          />
        </form>
      )}
    </FileDropzone>
  );
}
