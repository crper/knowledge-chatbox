import { runDocumentUpload } from "@/lib/document-upload";
import { getErrorMessage, isAbortError } from "@/lib/utils";
import { uploadDocument, type KnowledgeDocument } from "@/features/knowledge/api/documents";
import type { ComposerAttachmentItem } from "../store/chat-composer-store";
import type { ReadyChatAttachment } from "./chat-submit-helpers";

type UploadQueuedChatAttachmentOptions = {
  signal?: AbortSignal;
};

type UploadQueuedChatAttachmentsInput = {
  attachments: ComposerAttachmentItem[];
  concurrency?: number;
  failedMessage?: string;
  onPatch: (attachmentId: string, patch: Partial<ComposerAttachmentItem>) => void;
  signal?: AbortSignal;
  uploadFile?: (
    attachment: ComposerAttachmentItem,
    options?: UploadQueuedChatAttachmentOptions,
  ) => Promise<KnowledgeDocument>;
};

function toReadyAttachment(attachment: ComposerAttachmentItem): ReadyChatAttachment | null {
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

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function defaultUploadFile(
  attachment: ComposerAttachmentItem,
  failedMessage: string,
  options?: UploadQueuedChatAttachmentOptions,
) {
  if (!(attachment.file instanceof File)) {
    throw new Error("missing attachment file");
  }

  return runDocumentUpload({
    failedMessage,
    file: attachment.file,
    onPatch: () => {},
    signal: options?.signal,
    upload: uploadDocument,
  });
}

export async function uploadQueuedChatAttachments({
  attachments,
  concurrency = 2,
  failedMessage = "上传失败",
  onPatch,
  signal,
  uploadFile,
}: UploadQueuedChatAttachmentsInput) {
  const uploadedAttachments = attachments.map(() => null as ReadyChatAttachment | null);
  const boundedConcurrency = Math.max(1, concurrency);
  let nextIndex = 0;
  let firstError: unknown = null;

  const runUpload =
    uploadFile ??
    ((attachment: ComposerAttachmentItem, options?: UploadQueuedChatAttachmentOptions) =>
      defaultUploadFile(attachment, failedMessage, options));

  const workers = Array.from(
    { length: Math.min(boundedConcurrency, attachments.length) },
    async () => {
      while (nextIndex < attachments.length && firstError === null) {
        if (signal?.aborted) {
          if (firstError === null) {
            firstError = createAbortError();
          }
          break;
        }

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
          const document = await runUpload(attachment, { signal });
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
          if (isAbortError(error) || signal?.aborted) {
            onPatch(attachment.id, {
              errorMessage: undefined,
              progress: 0,
              status: "queued",
            });
            if (firstError === null) {
              firstError = error;
            }
            continue;
          }

          const errorMessage = getErrorMessage(error, failedMessage);
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
