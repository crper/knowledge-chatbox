/**
 * @file 聊天相关界面组件模块。
 */

import { useMemo, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { LoaderCircleIcon, PaperclipIcon, SendHorizontalIcon } from "lucide-react";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { Button } from "@/components/ui/button";
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
import type { ChatAttachmentItem, ChatSendShortcut } from "../store/chat-ui-store";
import { hasSendableChatAttachments } from "../utils/chat-attachments";
import { buildComposerAttachmentListItems } from "../utils/attachment-list-items";
import { AttachmentList } from "./attachment-list";
import { ImageViewerDialog, type ImageViewerItem } from "./image-viewer-dialog";

type MessageInputProps = {
  activeModelActionLabel?: string | null;
  onActiveModelAction?: () => void;
  activeModelLabel?: string | null;
  attachmentScopeHint?: string | null;
  attachments?: ChatAttachmentItem[];
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
  "min-h-11 focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 md:min-h-9";

function getPastedFileExtension(file: File) {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

function normalizeClipboardFile(file: File) {
  if (file.name.trim()) {
    return file;
  }

  return new File([file], `${PASTED_FILE_NAME_FALLBACK}.${getPastedFileExtension(file)}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function getClipboardFiles(event: ClipboardEvent<HTMLTextAreaElement>) {
  const itemFiles = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)
    .map(normalizeClipboardFile);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(event.clipboardData.files).map(normalizeClipboardFile);
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
  const reasoningModeLabel = t("reasoningModeLabel", { defaultValue: "思考模式" });
  const reasoningModeDefaultLabel = t("reasoningModeDefaultOption", { defaultValue: "默认" });
  const reasoningModeOffLabel = t("reasoningModeOffOption", { defaultValue: "关闭" });
  const reasoningModeOnLabel = t("reasoningModeOnOption", { defaultValue: "开启" });
  const hasSendableAttachment = hasSendableChatAttachments(attachments);
  const canSubmit = (draft.trim().length > 0 || hasSendableAttachment) && !submitPending;
  const imageAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment): attachment is ChatAttachmentItem & { file: File; kind: "image" } =>
          attachment.kind === "image" && attachment.file instanceof File,
      ),
    [attachments],
  );
  const imageViewerItems = useMemo<ImageViewerItem[]>(
    () =>
      imageAttachments.map((attachment) => ({
        kind: "local",
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType ?? attachment.file.type ?? "image/png",
        file: attachment.file,
      })),
    [imageAttachments],
  );
  const previewIndexes = useMemo(
    () => new Map(imageViewerItems.map((item, index) => [item.id, index])),
    [imageViewerItems],
  );
  const attachmentListItems = useMemo(
    () =>
      buildComposerAttachmentListItems({
        attachments,
        getStatusLabel: renderAttachmentStatus,
        onPreview: (attachmentId) => {
          const nextIndex = previewIndexes.get(attachmentId);
          if (typeof nextIndex === "number") {
            setViewerIndex(nextIndex);
          }
        },
        onRemove: onRemoveAttachment,
      }),
    [attachments, onRemoveAttachment, previewIndexes],
  );

  const triggerSubmit = () => {
    void Promise.resolve(onSubmit()).catch(() => {});
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    triggerSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing =
      event.nativeEvent.isComposing ||
      Boolean(
        (event as KeyboardEvent<HTMLTextAreaElement> & { isComposing?: boolean }).isComposing,
      );
    if (isComposing) {
      return;
    }

    const shouldSubmit =
      sendShortcut === "enter"
        ? event.key === "Enter" && !event.shiftKey
        : event.key === "Enter" && event.shiftKey;

    if (!shouldSubmit) {
      return;
    }

    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    triggerSubmit();
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getClipboardFiles(event);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    onAttachFiles?.(files);
  };

  function renderAttachmentStatus(attachment: ChatAttachmentItem) {
    if (attachment.status === "uploading") {
      return `${t("attachmentUploadingStatus")} ${attachment.progress ?? 0}%`;
    }
    if (attachment.status === "uploaded") {
      return t("attachmentUploadedStatus");
    }
    if (attachment.status === "failed") {
      return t("attachmentFailedStatus");
    }
    return t("attachmentQueuedStatus");
  }

  return (
    <FileDropzone
      disabled={submitPending}
      onFilesAccepted={onAttachFiles}
      onFilesRejected={onRejectFiles}
    >
      {({ getInputProps, getRootProps, isDragAccept, isDragActive, isDragReject, open }) => (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-message">
            {t("messageInputLabel")}
          </label>
          <div
            {...getRootProps({
              className: cn(
                "surface-liquid rounded-[1.75rem] p-3.5 transition-colors",
                isDragActive && "border-primary/35 bg-primary/8",
                isDragAccept && "border-primary/45 bg-primary/9",
                isDragReject && "border-destructive/40 bg-destructive/10",
              ),
              "data-testid": "message-input-shell",
            })}
          >
            <input {...getInputProps({ "aria-label": t("attachResourceAction") })} />
            {attachments.length > 0 ? (
              <div className="space-y-2.5">
                <div className="space-y-2" data-testid="message-input-attachments">
                  <AttachmentList
                    defaultCollapsed={false}
                    expandOnItemAdd={true}
                    items={attachmentListItems}
                    testId="composer-attachment-list"
                  />
                </div>
                {attachments.some((attachment) => attachment.errorMessage) ? (
                  <div className="space-y-1 px-1">
                    {attachments
                      .filter((attachment) => attachment.errorMessage)
                      .map((attachment) => (
                        <p
                          key={`${attachment.id}-error`}
                          className="text-xs leading-5 text-destructive"
                        >
                          {attachment.errorMessage}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {attachmentScopeHint ? (
              <p className="mt-2.5 px-1 text-xs leading-5 text-muted-foreground">
                {attachmentScopeHint}
              </p>
            ) : null}
            {isDragActive ? (
              <p
                className={cn(
                  "mb-3 px-1 text-xs",
                  isDragReject ? "text-destructive" : "text-primary",
                )}
              >
                {isDragReject ? t("attachmentDropRejectHint") : t("attachmentDropActiveHint")}
              </p>
            ) : null}
            <div
              className={cn("min-w-0", attachments.length > 0 ? "mt-3" : "")}
              data-testid="message-input-body"
            >
              <Textarea
                aria-label={t("messageInputLabel")}
                className="text-ui-body min-h-28 resize-none border-0 bg-transparent shadow-none placeholder:text-ui-caption placeholder:text-muted-foreground/85 focus-visible:ring-0"
                disabled={submitPending}
                id="chat-message"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t("messageInputPlaceholder")}
                value={draft}
              />
            </div>
            <div
              className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3"
              data-testid="message-input-actions"
            >
              <div className="min-w-0 flex flex-1 items-center gap-2.5">
                <Button
                  aria-label={t("attachResourceAction")}
                  className={cn(
                    composerControlSurfaceClassName,
                    composerTouchControlClassName,
                    "size-11 rounded-full border-border/60 hover:bg-background/36 md:size-9",
                  )}
                  disabled={submitPending}
                  onClick={open}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <PaperclipIcon className="size-4 md:size-3.5" />
                </Button>
                {activeModelLabel || reasoningModeVisible ? (
                  <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                    {activeModelActionLabel ? (
                      <button
                        className={cn(
                          composerControlSurfaceClassName,
                          composerTouchControlClassName,
                          "flex max-w-[min(48vw,20rem)] min-w-0 cursor-pointer select-none items-center rounded-[1.1rem] px-3 py-2 text-[0.76rem] text-foreground hover:bg-background/34 hover:text-foreground sm:text-[0.82rem]",
                        )}
                        onClick={onActiveModelAction}
                        title={activeModelActionLabel}
                        type="button"
                      >
                        <span className="truncate">{activeModelActionLabel}</span>
                      </button>
                    ) : activeModelLabel ? (
                      <div
                        className={cn(
                          composerControlSurfaceClassName,
                          composerTouchControlClassName,
                          "flex max-w-[min(48vw,20rem)] min-w-0 select-none items-center rounded-[1.1rem] px-3 py-2 text-[0.76rem] text-foreground sm:text-[0.82rem]",
                        )}
                        title={activeModelLabel}
                      >
                        <span className="truncate">{activeModelLabel}</span>
                      </div>
                    ) : null}
                    {reasoningModeVisible ? (
                      <Select
                        disabled={submitPending}
                        onValueChange={(value) =>
                          onReasoningModeChange?.(value as ChatReasoningMode)
                        }
                        value={reasoningMode}
                      >
                        <SelectTrigger
                          aria-label={reasoningModeLabel}
                          className={cn(
                            composerControlSurfaceClassName,
                            composerTouchControlClassName,
                            "min-w-28 rounded-[1rem] px-3 text-[0.76rem] sm:min-w-22 sm:text-[0.8rem]",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">{reasoningModeDefaultLabel}</SelectItem>
                          <SelectItem value="off">{reasoningModeOffLabel}</SelectItem>
                          <SelectItem value="on">{reasoningModeOnLabel}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Button
                aria-label={submitPending ? t("sendingAction") : t("sendAction")}
                className="size-11 rounded-full"
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
              {submitPending ? (
                <span
                  aria-atomic="true"
                  aria-label={t("sendingAction")}
                  aria-live="polite"
                  className="sr-only"
                  role="status"
                >
                  {t("sendingAction")}
                </span>
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
        </form>
      )}
    </FileDropzone>
  );
}
