import { runDocumentUpload } from "@/lib/document-upload";
import { uploadDocument, type KnowledgeDocument } from "@/features/knowledge/api/documents";
import type { ChatAttachmentItem } from "../store/chat-ui-store";
import type { ReadyChatAttachment } from "./chat-submit-helpers";

type UploadQueuedChatAttachmentsInput = {
  attachments: ChatAttachmentItem[];
  concurrency?: number;
  failedMessage?: string;
  onPatch: (attachmentId: string, patch: Partial<ChatAttachmentItem>) => void;
  uploadFile?: (attachment: ChatAttachmentItem) => Promise<KnowledgeDocument>;
};

function toReadyAttachment(attachment: ChatAttachmentItem): ReadyChatAttachment | null {
  if (
    attachment.status !== "uploaded" ||
    !(attachment.file instanceof File) ||
    !attachment.mimeType ||
    typeof attachment.resourceDocumentId !== "number" ||
    typeof attachment.resourceDocumentVersionId !== "number"
  ) {
    return null;
  }

  return {
    ...attachment,
    file: attachment.file,
    mimeType: attachment.mimeType,
    resourceDocumentId: attachment.resourceDocumentId,
    resourceDocumentVersionId: attachment.resourceDocumentVersionId,
    status: "uploaded",
  };
}

function defaultUploadFile(attachment: ChatAttachmentItem, failedMessage: string) {
  if (!(attachment.file instanceof File)) {
    throw new Error("missing attachment file");
  }

  return runDocumentUpload({
    failedMessage,
    file: attachment.file,
    onPatch: () => {},
    upload: uploadDocument,
  });
}

export async function uploadQueuedChatAttachments({
  attachments,
  concurrency = 2,
  failedMessage = "上传失败",
  onPatch,
  uploadFile,
}: UploadQueuedChatAttachmentsInput) {
  const uploadedAttachments = attachments.map(() => null as ReadyChatAttachment | null);
  const boundedConcurrency = Math.max(1, concurrency);
  let nextIndex = 0;
  let firstError: unknown = null;

  const runUpload =
    uploadFile ??
    ((attachment: ChatAttachmentItem) => defaultUploadFile(attachment, failedMessage));

  const workers = Array.from(
    { length: Math.min(boundedConcurrency, attachments.length) },
    async () => {
      while (nextIndex < attachments.length && firstError === null) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const attachment = attachments[currentIndex]!;
        const readyAttachment = toReadyAttachment(attachment);

        if (readyAttachment) {
          uploadedAttachments[currentIndex] = readyAttachment;
          continue;
        }

        if (attachment.status !== "queued" || !attachment.file || !attachment.mimeType) {
          continue;
        }

        try {
          const document = await runUpload(attachment);
          const uploadedAttachment: ReadyChatAttachment = {
            ...attachment,
            file: attachment.file,
            mimeType: attachment.mimeType,
            resourceDocumentId: document.document_id,
            resourceDocumentVersionId: document.id,
            status: "uploaded",
          };
          onPatch(attachment.id, {
            errorMessage: undefined,
            progress: 100,
            resourceDocumentId: document.document_id,
            resourceDocumentVersionId: document.id,
            status: "uploaded",
          });
          uploadedAttachments[currentIndex] = uploadedAttachment;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : failedMessage;
          onPatch(attachment.id, {
            errorMessage,
            progress: 0,
            status: "failed",
          });
          if (firstError === null) {
            firstError = error;
          }
        }
      }
    },
  );

  await Promise.allSettled(workers);

  if (firstError !== null) {
    throw firstError;
  }

  const readyAttachments = uploadedAttachments.filter(
    (attachment): attachment is ReadyChatAttachment => attachment !== null,
  );

  return {
    uploadedAttachments: readyAttachments,
    uploadedCount: readyAttachments.length,
  };
}
