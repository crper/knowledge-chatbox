import type { ChatMessageItem } from "../api/chat";
import type { ChatAttachmentItem } from "../store/chat-ui-store";

export type ReadyChatAttachment = ChatAttachmentItem & {
  file: File;
  kind: "image" | "document";
  mimeType: string;
  resourceDocumentId: number;
  resourceDocumentVersionId: number;
  status: "uploaded";
};

export function serializeChatAttachments(attachments: ReadyChatAttachment[]): Array<{
  attachment_id: string;
  document_id: number;
  document_revision_id: number;
  mime_type: string;
  name: string;
  size_bytes: number;
  type: "image" | "document";
}> {
  return attachments.map((attachment) => ({
    attachment_id: attachment.id,
    type: attachment.kind,
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes ?? attachment.file.size,
    document_id: attachment.resourceDocumentId,
    document_revision_id: attachment.resourceDocumentVersionId,
  }));
}

export function cloneChatAttachments(attachments: ChatAttachmentItem[]) {
  return attachments.map((attachment) => ({ ...attachment }));
}

export function buildLocalAttachmentFingerprint(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join("::");
}

export function collectLocalAttachmentFingerprints(attachments: ChatAttachmentItem[]) {
  return new Set(
    attachments.flatMap((attachment) =>
      attachment.file instanceof File ? [buildLocalAttachmentFingerprint(attachment.file)] : [],
    ),
  );
}

export function resolveSubmitErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (!message || message === "chat stream request failed") {
    return fallback;
  }

  return message;
}

function toAttachmentSignature(input: {
  attachmentId: string;
  documentId: number | null;
  documentRevisionId: number | null;
  kind: string;
  mimeType: string | null;
  name: string;
  sizeBytes: number | null;
}) {
  return JSON.stringify(input);
}

function toComposerAttachmentSignature(attachment: ChatAttachmentItem) {
  return toAttachmentSignature({
    attachmentId: attachment.id,
    documentId: attachment.resourceDocumentId ?? null,
    documentRevisionId: attachment.resourceDocumentVersionId ?? null,
    kind: attachment.kind,
    mimeType: attachment.mimeType ?? null,
    name: attachment.name,
    sizeBytes: attachment.sizeBytes ?? null,
  });
}

function toMessageAttachmentSignature(
  attachment: NonNullable<ChatMessageItem["attachments_json"]>[number],
) {
  return toAttachmentSignature({
    attachmentId: attachment.attachment_id,
    documentId: attachment.resource_document_id ?? null,
    documentRevisionId: attachment.resource_document_version_id ?? null,
    kind: attachment.type,
    mimeType: attachment.mime_type,
    name: attachment.name,
    sizeBytes: attachment.size_bytes,
  });
}

export function shouldResetComposerSnapshotForRetry({
  composerAttachments,
  composerDraft,
  retryAttachments,
  retryContent,
}: {
  composerAttachments: ChatAttachmentItem[];
  composerDraft: string;
  retryAttachments: ChatMessageItem["attachments_json"];
  retryContent: string;
}) {
  if (composerDraft.trim() !== retryContent.trim()) {
    return false;
  }

  const normalizedComposerAttachments = composerAttachments
    .map(toComposerAttachmentSignature)
    .sort();
  const normalizedRetryAttachments = (retryAttachments ?? [])
    .map(toMessageAttachmentSignature)
    .sort();

  if (normalizedComposerAttachments.length !== normalizedRetryAttachments.length) {
    return false;
  }

  return normalizedComposerAttachments.every(
    (attachmentSignature, index) => attachmentSignature === normalizedRetryAttachments[index],
  );
}
