/**
 * @file 聊天相关界面组件模块。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { LoaderCircleIcon, PaperclipIcon, SendHorizontalIcon } from "lucide-react";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { Button } from "@/components/ui/button";
import { isInputComposing } from "@/lib/dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatReasoningMode } from "../api/chat";
import type { ComposerAttachmentItem } from "../store/chat-attachment-store";
import type { ChatSendShortcut } from "../store/chat-ui-store";
import { hasSendableChatAttachments } from "../utils/chat-attachments";
import {
  buildAttachmentPreviewIndexes,
  buildComposerAttachmentListItems,
  buildComposerImageViewerItems,
} from "../utils/attachment-list-items";
import { AttachmentList } from "./attachment-list";
import { ImageViewerDialog } from "./image-viewer-dialog";

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
  onSubmit: () => void | Promise<void>;
  reasoningMode?: ChatReasoningMode;
  reasoningModeVisible?: boolean;
  sendShortcut: ChatSendShortcut;
  submitPending?: boolean;
};

const PASTED_FILE_NAME_FALLBACK = "pasted-image";
const composerControlSurfaceClassName =
  "border border-border/68 bg-input/72 shadow-[0_8px_18px_-18px_hsl(var(--shadow-color)/0.2)] transition-[background-color,border-color,box-shadow,color] dark:bg-input/84";
const composerTouchControlClassName =
  "min-h-[2.625rem] focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 md:min-h-9";

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
      label: t("reasoningModeLabel", { defaultValue: "思考模式" }),
      default: t("reasoningModeDefaultOption", { defaultValue: "默认" }),
      off: t("reasoningModeOffOption", { defaultValue: "关闭" }),
      on: t("reasoningModeOnOption", { defaultValue: "开启" }),
    }),
    [t],
  );

  const hasSendableAttachment = hasSendableChatAttachments(attachments);
  const hasContextControls = Boolean(
    activeModelActionLabel || activeModelLabel || reasoningModeVisible,
  );
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

  const attachmentErrors = useMemo(() => attachments.filter((a) => a.errorMessage), [attachments]);

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

            {/* 附件列表 */}
            {attachments.length > 0 && (
              <div className="space-y-2.5">
                <div className="space-y-2" data-testid="message-input-attachments">
                  <AttachmentList
                    defaultCollapsed={false}
                    expandOnItemAdd
                    items={attachmentListItems}
                    testId="composer-attachment-list"
                  />
                </div>
                {attachmentErrors.length > 0 && (
                  <div className="space-y-1 px-1">
                    {attachmentErrors.map((attachment) => (
                      <p
                        key={`${attachment.id}-error`}
                        className="text-ui-caption text-destructive"
                      >
                        {attachment.errorMessage}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

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

            {/* 附件范围提示 */}
            {attachmentScopeHint && (
              <p className="mt-2.5 px-1 text-ui-caption text-muted-foreground">
                {attachmentScopeHint}
              </p>
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

            {/* 操作按钮区 */}
            <div
              className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 border-t border-border/60 pt-2.5 sm:mt-3 sm:gap-x-2.5 sm:gap-y-2 sm:pt-3"
              data-testid="message-input-actions"
              onPointerDownCapture={blurTextareaIfFocused}
            >
              {/* 附件按钮 */}
              <Button
                aria-label={t("attachResourceAction")}
                className={cn(
                  composerControlSurfaceClassName,
                  composerTouchControlClassName,
                  "col-start-1 row-start-1 size-[2.625rem] self-start rounded-full border-border/60 hover:bg-background/36 md:size-9",
                )}
                disabled={submitPending}
                onClick={open}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <PaperclipIcon className="size-4 md:size-3.5" />
              </Button>

              {/* 上下文控制区 */}
              {hasContextControls && (
                <div className="col-start-2 row-start-1 grid min-w-0 gap-2 sm:flex sm:min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
                  {/* 模型标签/操作 */}
                  {activeModelActionLabel ? (
                    <Button
                      className={cn(
                        composerControlSurfaceClassName,
                        composerTouchControlClassName,
                        "w-full min-w-0 justify-start rounded-xl px-2.5 py-1.5 text-ui-caption text-foreground shadow-none hover:bg-background/34 hover:text-foreground sm:max-w-[min(48vw,20rem)] sm:px-3 sm:py-2",
                      )}
                      onClick={onActiveModelAction}
                      size="sm"
                      title={activeModelActionLabel}
                      type="button"
                      variant="ghost"
                    >
                      <span className="truncate">{activeModelActionLabel}</span>
                    </Button>
                  ) : activeModelLabel ? (
                    <div
                      className={cn(
                        composerControlSurfaceClassName,
                        composerTouchControlClassName,
                        "flex w-full min-w-0 select-none items-center rounded-xl px-2.5 py-1.5 text-ui-caption text-foreground sm:max-w-[min(48vw,20rem)] sm:px-3 sm:py-2",
                      )}
                      title={activeModelLabel}
                    >
                      <span className="truncate">{activeModelLabel}</span>
                    </div>
                  ) : null}

                  {/* 推理模式选择 */}
                  {reasoningModeVisible && (
                    <Select
                      disabled={submitPending}
                      items={[
                        { label: reasoningLabels.default, value: "default" },
                        { label: reasoningLabels.off, value: "off" },
                        { label: reasoningLabels.on, value: "on" },
                      ]}
                      onValueChange={(value) => onReasoningModeChange?.(value as ChatReasoningMode)}
                      value={reasoningMode}
                    >
                      <SelectTrigger
                        aria-label={reasoningLabels.label}
                        className={cn(
                          composerControlSurfaceClassName,
                          composerTouchControlClassName,
                          "w-full min-w-0 rounded-xl px-2.5 text-ui-caption sm:min-w-28 sm:w-auto sm:px-3",
                        )}
                      >
                        <SelectValue>{() => reasoningLabels[reasoningMode]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{reasoningLabels.default}</SelectItem>
                        <SelectItem value="off">{reasoningLabels.off}</SelectItem>
                        <SelectItem value="on">{reasoningLabels.on}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* 发送按钮 */}
              <Button
                aria-label={submitPending ? t("sendingAction") : t("sendAction")}
                className="col-start-3 row-start-1 size-[2.625rem] self-start rounded-full md:size-9"
                disabled={!canSubmit}
                size="icon"
                type="submit"
              >
                {submitPending ? (
                  <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <SendHorizontalIcon aria-hidden="true" className="size-4" />
                )}
              </Button>

              {/* 发送状态提示（屏幕阅读器） */}
              {submitPending && (
                <span
                  aria-atomic="true"
                  aria-label={t("sendingAction")}
                  aria-live="polite"
                  className="sr-only"
                  role="status"
                >
                  {t("sendingAction")}
                </span>
              )}
            </div>
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
