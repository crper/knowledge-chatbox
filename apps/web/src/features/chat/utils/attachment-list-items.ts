/**
 * @file 聊天附件列表项构造工具。
 */

import { i18n } from "@/i18n";
import type { ImageViewerItem } from "../components/image-viewer-dialog";
import type { ChatAttachmentItem as ChatMessageAttachmentItem } from "../api/chat";
import type { ComposerAttachmentItem as ChatComposerAttachmentItem } from "../store/chat-composer-store";
import { getDocumentFileUrl } from "./document-file-url";

const OPAQUE_IMAGE_NAME_RE =
  /^[a-f0-9]{24,}(?:[-_.][a-z0-9]+)*\.(png|jpe?g|webp)(?:[~._-][a-z0-9-]+)*$/;

export type AttachmentListItem = {
  displayName: string;
  id: string;
  kind: "image" | "document";
  onPreview?: () => void;
  onRemove?: () => void;
  previewable: boolean;
  rawName?: string;
  statusLabel?: string;
};

type ChatAttachmentDescriptor = {
  attachment: ChatMessageAttachmentItem;
  displayName: string;
  id: string;
  kind: "image" | "document";
  previewable: boolean;
  rawName?: string;
};

function describeAttachmentListName(
  attachment: { kind: "image" | "document"; name: string },
  index: number,
) {
  const isOpaqueImageName =
    attachment.kind === "image" && OPAQUE_IMAGE_NAME_RE.test(attachment.name);

  return {
    displayName: isOpaqueImageName
      ? i18n.t("attachmentOpaqueFallback", {
          ns: "chat",
          index: index + 1,
        })
      : attachment.name,
    rawName: isOpaqueImageName ? attachment.name : undefined,
  };
}

export function buildComposerAttachmentListItems(input: {
  attachments: ChatComposerAttachmentItem[];
  getStatusLabel: (attachment: ChatComposerAttachmentItem) => string;
  onPreview?: (attachmentId: string) => void;
  onRemove?: (attachmentId: string) => void;
}): AttachmentListItem[] {
  return input.attachments.map((attachment) => ({
    displayName: attachment.name,
    id: attachment.id,
    kind: attachment.kind,
    onPreview:
      attachment.kind === "image" && attachment.file
        ? () => input.onPreview?.(attachment.id)
        : undefined,
    onRemove: () => input.onRemove?.(attachment.id),
    previewable: attachment.kind === "image" && Boolean(attachment.file),
    statusLabel: input.getStatusLabel(attachment),
  }));
}

export function buildComposerImageViewerItems(
  attachments: ChatComposerAttachmentItem[],
): ImageViewerItem[] {
  return attachments.flatMap((attachment) => {
    if (attachment.kind !== "image" || !(attachment.file instanceof File)) {
      return [];
    }

    return [
      {
        kind: "local",
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType ?? attachment.file.type ?? "image/png",
        file: attachment.file,
      },
    ];
  });
}

export function buildChatAttachmentDescriptors(
  attachments: ChatMessageAttachmentItem[],
): ChatAttachmentDescriptor[] {
  let imageIndex = 0;

  return attachments.map((attachment) => {
    const kind = attachment.type === "image" ? "image" : "document";
    const display = describeAttachmentListName(
      {
        kind,
        name: attachment.name,
      },
      imageIndex,
    );

    if (kind === "image") {
      imageIndex += 1;
    }

    return {
      attachment,
      displayName: display.displayName,
      id: attachment.attachment_id,
      kind,
      previewable: kind === "image" && typeof attachment.resource_document_version_id === "number",
      rawName: display.rawName,
    };
  });
}

export function buildChatAttachmentListItems(input: {
  descriptors: ChatAttachmentDescriptor[];
  onPreview?: (attachmentId: string) => void;
}): AttachmentListItem[] {
  return input.descriptors.map((descriptor) => ({
    displayName: descriptor.displayName,
    id: descriptor.id,
    kind: descriptor.kind,
    onPreview: descriptor.previewable ? () => input.onPreview?.(descriptor.id) : undefined,
    previewable: descriptor.previewable,
    rawName: descriptor.rawName,
  }));
}

export function buildChatImageViewerItems(
  descriptors: ChatAttachmentDescriptor[],
): ImageViewerItem[] {
  return descriptors.flatMap((descriptor) => {
    if (descriptor.kind !== "image" || !descriptor.previewable) {
      return [];
    }

    return [
      {
        kind: "remote",
        id: descriptor.id,
        displayName: descriptor.displayName,
        name: descriptor.attachment.name,
        mimeType: descriptor.attachment.mime_type,
        originalUrl: getDocumentFileUrl(descriptor.attachment.resource_document_version_id ?? 0),
        resourceDocumentVersionId: descriptor.attachment.resource_document_version_id ?? 0,
      },
    ];
  });
}

export function buildAttachmentPreviewIndexes<TItem extends { id: string }>(items: TItem[]) {
  return new Map(items.map((item, index) => [item.id, index]));
}
