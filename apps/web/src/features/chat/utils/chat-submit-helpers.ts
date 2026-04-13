import { ApiRequestError } from "@/lib/api/api-request-error";
import { getErrorMessage } from "@/lib/utils";
import type { ChatMessageItem } from "../api/chat";
import type { ComposerAttachmentItem } from "../store/chat-composer-store";

export type ReadyChatAttachment = ComposerAttachmentItem & {
  file: File;
  kind: "image" | "document";
  mimeType: string;
  documentId: number;
  documentRevisionId: number;
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
    document_id: attachment.documentId,
    document_revision_id: attachment.documentRevisionId,
  }));
}

export function buildLocalAttachmentFingerprint(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join("::");
}

export function collectLocalAttachmentFingerprints(attachments: ComposerAttachmentItem[]) {
  return new Set(
    attachments.flatMap((attachment) =>
      attachment.file instanceof File ? [buildLocalAttachmentFingerprint(attachment.file)] : [],
    ),
  );
}

function normalizeErrorMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[.!]+$/g, "")
    .trim();
}

function isGenericErrorMessage(normalizedMessage: string): boolean {
  return !normalizedMessage || normalizedMessage.includes("chat stream request failed");
}

export function resolveSubmitErrorMessage(error: unknown, fallback: string) {
  const message = getErrorMessage(error, "").trim();
  const normalizedMessage = normalizeErrorMessage(message);

  if (error instanceof ApiRequestError && error.status >= 500) {
    return fallback;
  }
  if (isGenericErrorMessage(normalizedMessage)) {
    return fallback;
  }
  return message;
}

type AttachmentSignatureInput = {
  attachmentId: string;
  documentId: number | null;
  documentRevisionId: number | null;
  kind: string;
  mimeType: string | null;
  name: string;
  sizeBytes: number | null;
};

function toAttachmentSignature(input: AttachmentSignatureInput): string {
  return JSON.stringify(input);
}

function toComposerAttachmentSignature(attachment: ComposerAttachmentItem): string {
  return toAttachmentSignature({
    attachmentId: attachment.id,
    documentId: attachment.documentId ?? null,
    documentRevisionId: attachment.documentRevisionId ?? null,
    kind: attachment.kind,
    mimeType: attachment.mimeType ?? null,
    name: attachment.name,
    sizeBytes: attachment.sizeBytes ?? null,
  });
}

function toMessageAttachmentSignature(
  attachment: NonNullable<ChatMessageItem["attachments"]>[number],
): string {
  return toAttachmentSignature({
    attachmentId: attachment.attachment_id,
    documentId: attachment.document_id ?? null,
    documentRevisionId: attachment.document_revision_id ?? null,
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
  composerAttachments: ComposerAttachmentItem[];
  composerDraft: string;
  retryAttachments: ChatMessageItem["attachments"];
  retryContent: string;
}) {
  if (composerDraft.trim() !== retryContent.trim()) {
    return false;
  }

  const normalizedComposerAttachments = composerAttachments
    .filter((a): a is NonNullable<typeof a> => a != null)
    .map(toComposerAttachmentSignature)
    .sort();
  const normalizedRetryAttachments = (retryAttachments ?? [])
    .filter((a): a is NonNullable<typeof a> => a != null)
    .map(toMessageAttachmentSignature)
    .sort();

  if (normalizedComposerAttachments.length !== normalizedRetryAttachments.length) {
    return false;
  }

  return normalizedComposerAttachments.every(
    (signature, i) => signature === normalizedRetryAttachments[i],
  );
}
