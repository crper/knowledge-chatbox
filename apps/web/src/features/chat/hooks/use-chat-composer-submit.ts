/**
 * @file 聊天 composer 提交与重试 Hook 模块。
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { queryKeys } from "@/lib/api/query-keys";
import { invalidateDocuments } from "@/features/knowledge/api/documents-query";
import type {
  ChatAttachmentItem as PersistedChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
} from "../api/chat";
import type { ChatStreamAttachmentInput } from "../api/chat-stream";
import {
  serializeChatAttachments,
  shouldResetComposerSnapshotForRetry,
} from "../utils/chat-submit-helpers";
import { clearComposer, restoreComposer, snapshotComposer } from "../utils/composer-transaction";
import { uploadQueuedChatAttachments } from "../utils/upload-chat-attachments";
import { MessageRole, MessageStatus } from "../constants";

type UseChatComposerSubmitParams = {
  beginSessionSubmit: (sessionId: number) => boolean;
  finishSessionSubmit: (sessionId: number) => void;
  findRunByAssistantMessageId: (assistantMessageId: number) =>
    | {
        assistantMessageId: number;
        retryOfMessageId?: number | null;
        runId: number;
        sessionId: number;
        status: MessageStatus;
        toastShown: boolean;
        userContent: string;
        userMessageId: number | null;
      }
    | undefined;
  messages: ChatMessageItem[];
  patchSessionContext: (input: {
    attachments?: ChatSessionContextItem["attachments"];
    latestAssistantMessageId?: number;
    latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
    sessionId: number;
  }) => void;
  patchUserMessageAttachments: (input: {
    attachments: PersistedChatAttachmentItem[];
    sessionId: number;
    userMessageId: number;
  }) => boolean;
  requestScrollToLatest: () => void;
  resolvedActiveSessionId: number | null;
  sendStreamMessage: (input: {
    attachments?: ChatStreamAttachmentInput[];
    content: string;
    retryOfMessageId?: number;
    sessionId: number;
  }) => Promise<{ userMessageId?: number | null }>;
};

function toPersistedChatAttachments(
  attachments: ChatStreamAttachmentInput[],
): PersistedChatAttachmentItem[] {
  return attachments.map(
    ({ attachment_id, name, mime_type, document_id, document_revision_id, size_bytes, type }) => ({
      attachment_id,
      archived_at: null,
      name,
      mime_type,
      resource_document_id: document_id ?? null,
      resource_document_version_id: document_revision_id,
      size_bytes,
      type,
    }),
  );
}

function buildRestoredComposerSnapshot({
  composerSnapshot,
  workingAttachments,
}: {
  composerSnapshot: ReturnType<typeof snapshotComposer>;
  workingAttachments: typeof composerSnapshot.attachments;
}) {
  const attachmentById = new Map(
    workingAttachments.map((attachment) => [attachment.id, attachment]),
  );

  return {
    draft: composerSnapshot.draft,
    attachments: composerSnapshot.attachments.map(
      (attachment) => attachmentById.get(attachment.id) ?? attachment,
    ),
  };
}

export function useChatComposerSubmit({
  beginSessionSubmit,
  finishSessionSubmit,
  findRunByAssistantMessageId,
  messages,
  patchSessionContext,
  patchUserMessageAttachments,
  requestScrollToLatest,
  resolvedActiveSessionId,
  sendStreamMessage,
}: UseChatComposerSubmitParams) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();

  const submitMessage = useCallback(async () => {
    if (resolvedActiveSessionId === null) {
      return;
    }

    const sessionId = resolvedActiveSessionId;
    if (!beginSessionSubmit(sessionId)) {
      return;
    }

    const composerSnapshot = snapshotComposer(sessionId);
    const sendableAttachments = composerSnapshot.attachments.filter(
      (attachment) => attachment.status !== MessageStatus.FAILED,
    );

    if (!composerSnapshot.draft.trim() && sendableAttachments.length === 0) {
      finishSessionSubmit(sessionId);
      return;
    }

    clearComposer(sessionId);

    const workingAttachments = sendableAttachments.map((a) => ({ ...a }));
    const restoreComposerSnapshot = () =>
      restoreComposer(
        sessionId,
        buildRestoredComposerSnapshot({
          composerSnapshot,
          workingAttachments,
        }),
      );

    try {
      const { uploadedAttachments: persistedAttachments, uploadedCount } =
        await uploadQueuedChatAttachments({
          attachments: workingAttachments.filter((item) => item.status !== MessageStatus.FAILED),
          concurrency: 2,
          failedMessage: t("attachmentUploadFailed"),
          onPatch: (attachmentId, patch) => {
            const targetAttachment = workingAttachments.find((item) => item.id === attachmentId);
            if (!targetAttachment) {
              return;
            }
            Object.assign(targetAttachment, patch);
          },
        });

      if (uploadedCount > 0) {
        void invalidateDocuments(queryClient);
      }

      const serializedAttachments = serializeChatAttachments(persistedAttachments);
      const persistedChatAttachments = toPersistedChatAttachments(serializedAttachments);
      if (!composerSnapshot.draft.trim() && serializedAttachments.length === 0) {
        return;
      }

      requestScrollToLatest();
      const streamResult = await sendStreamMessage({
        attachments: serializedAttachments,
        sessionId,
        content: composerSnapshot.draft,
      });
      if (streamResult.userMessageId && serializedAttachments.length > 0) {
        const patched = patchUserMessageAttachments({
          attachments: persistedChatAttachments,
          sessionId,
          userMessageId: streamResult.userMessageId,
        });
        patchSessionContext({
          attachments: persistedChatAttachments,
          sessionId,
        });
        if (!patched) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.chat.messagesWindow(sessionId),
          });
        }
        void invalidateDocuments(queryClient);
      }
    } catch {
      restoreComposerSnapshot();
      return;
    } finally {
      finishSessionSubmit(sessionId);
    }
  }, [
    beginSessionSubmit,
    finishSessionSubmit,
    patchSessionContext,
    patchUserMessageAttachments,
    queryClient,
    requestScrollToLatest,
    resolvedActiveSessionId,
    sendStreamMessage,
    t,
  ]);

  const retryMessage = useCallback(
    async (message: ChatMessageItem) => {
      if (resolvedActiveSessionId === null) {
        return;
      }

      const sessionId = resolvedActiveSessionId;
      if (!beginSessionSubmit(sessionId)) {
        return;
      }

      const retryOfMessageId =
        message.role === MessageRole.ASSISTANT ? (message.reply_to_message_id ?? null) : message.id;
      if (retryOfMessageId === null) {
        finishSessionSubmit(sessionId);
        return;
      }

      const retryContent =
        message.role === MessageRole.ASSISTANT
          ? (messages.find((item) => item.id === retryOfMessageId)?.content ??
            findRunByAssistantMessageId(message.id)?.userContent ??
            message.content)
          : message.content;
      const retryAttachments =
        message.role === MessageRole.ASSISTANT
          ? (messages.find((item) => item.id === retryOfMessageId)?.attachments_json ?? null)
          : (message.attachments_json ?? null);
      const composerSnapshot = snapshotComposer(sessionId);
      const shouldResetComposerSnapshot = shouldResetComposerSnapshotForRetry({
        composerAttachments: composerSnapshot.attachments,
        composerDraft: composerSnapshot.draft,
        retryAttachments,
        retryContent,
      });

      if (shouldResetComposerSnapshot) {
        clearComposer(sessionId);
      }

      try {
        requestScrollToLatest();
        await sendStreamMessage({
          sessionId,
          content: retryContent,
          retryOfMessageId,
        });
      } catch {
        if (shouldResetComposerSnapshot) {
          restoreComposer(sessionId, composerSnapshot);
        }
        return;
      } finally {
        finishSessionSubmit(sessionId);
      }
    },
    [
      beginSessionSubmit,
      finishSessionSubmit,
      findRunByAssistantMessageId,
      messages,
      requestScrollToLatest,
      resolvedActiveSessionId,
      sendStreamMessage,
    ],
  );

  return {
    retryMessage,
    submitMessage,
  };
}
