import { useCallback } from "react";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { detectSupportedUploadKind } from "@/features/knowledge/upload-file-types";
import { getDocumentUploadRejectionMessage } from "@/lib/document-upload";
import { useChatAttachmentStore } from "../store/chat-attachment-store";
import {
  buildLocalAttachmentFingerprint,
  collectLocalAttachmentFingerprints,
} from "../utils/chat-submit-helpers";

type UseChatAttachmentIntakeParams = {
  resolvedActiveSessionId: number | null;
};

export function useChatAttachmentIntake({
  resolvedActiveSessionId,
}: UseChatAttachmentIntakeParams) {
  const { t } = useTranslation(["chat", "common"]);
  const addAttachment = useChatAttachmentStore((state) => state.addAttachment);

  const attachFiles = useCallback(
    (files: File[]) => {
      if (resolvedActiveSessionId === null || files.length === 0) {
        return;
      }

      const existingAttachments =
        useChatAttachmentStore.getState().attachmentsBySession[String(resolvedActiveSessionId)] ??
        [];
      const knownFingerprints = collectLocalAttachmentFingerprints(existingAttachments);

      for (const file of files) {
        const fingerprint = buildLocalAttachmentFingerprint(file);
        if (knownFingerprints.has(fingerprint)) {
          continue;
        }
        knownFingerprints.add(fingerprint);

        const attachmentId = crypto.randomUUID();
        const kind = detectSupportedUploadKind(file);
        if (kind === null) {
          addAttachment(resolvedActiveSessionId, {
            id: attachmentId,
            kind: "document",
            name: file.name,
            sizeBytes: file.size,
            status: "failed",
            errorMessage: t("attachmentUnsupportedFileType"),
          });
          toast.error(t("attachmentUnsupportedFileType"));
          continue;
        }

        addAttachment(resolvedActiveSessionId, {
          id: attachmentId,
          kind,
          name: file.name,
          sizeBytes: file.size,
          file,
          mimeType: file.type || undefined,
          status: "queued",
        });
      }
    },
    [addAttachment, resolvedActiveSessionId, t],
  );

  const rejectFiles = useCallback(
    (rejections: FileRejection[]) => {
      if (resolvedActiveSessionId === null || rejections.length === 0) {
        return;
      }

      rejections.forEach((rejection) => {
        const message = getDocumentUploadRejectionMessage(rejection, {
          failedMessage: t("attachmentUploadFailed"),
          unsupportedFileTypeMessage: t("attachmentUnsupportedFileType"),
        });
        addAttachment(resolvedActiveSessionId, {
          id: crypto.randomUUID(),
          errorMessage: message,
          kind: "document",
          name: rejection.file.name,
          sizeBytes: rejection.file.size,
          status: "failed",
        });
        toast.error(message);
      });
    },
    [addAttachment, resolvedActiveSessionId, t],
  );

  return {
    attachFiles,
    rejectFiles,
  };
}
