/**
 * @file 聊天 composer 提交与重试 Hook 模块。
 */

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { invalidateDocuments } from "@/features/knowledge/api/documents-query";
import type { ChatAttachmentItem, ChatMessageItem } from "../api/chat";
import type { ChatStreamAttachmentInput } from "../api/chat-stream";
import { MessageRole, MessageStatus } from "../constants";
import type { ChatRuntime } from "../runtime/chat-runtime";
import type { ChatCacheWriter } from "../utils/chat-cache-writer";
import {
  serializeChatAttachments,
  shouldResetComposerSnapshotForRetry,
} from "../utils/chat-submit-helpers";
import { clearComposer, restoreComposer, snapshotComposer } from "../utils/composer-transaction";
import { uploadQueuedChatAttachments } from "../utils/upload-chat-attachments";

type UseChatComposerSubmitParams = {
  runtime: Pick<ChatRuntime, "beginSubmit" | "finishSubmit">;
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
  cacheWriter: Pick<
    ChatCacheWriter,
    "invalidateSessionArtifacts" | "patchSessionContext" | "patchUserMessageAttachments"
  >;
  requestScrollToLatest: () => void;
  resolvedActiveSessionId: number | null;
  sendStreamMessage: (input: {
    attachments?: ChatStreamAttachmentInput[];
    clientRequestId: string;
    content: string;
    retryOfMessageId?: number;
    sessionId: number;
    signal?: AbortSignal;
  }) => Promise<{ userMessageId?: number | null }>;
};

function toPersistedChatAttachments(
  attachments: ChatStreamAttachmentInput[],
): ChatAttachmentItem[] {
  return attachments.map(
    ({ attachment_id, name, mime_type, document_id, document_revision_id, size_bytes, type }) => ({
      attachment_id,
      archived_at: null,
      name,
      mime_type,
      document_id: document_id ?? null,
      document_revision_id,
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

async function performAttachmentUploadAndSend(
  deps: {
    cacheWriter: Pick<
      ChatCacheWriter,
      "invalidateSessionArtifacts" | "patchSessionContext" | "patchUserMessageAttachments"
    >;
    clientRequestId: string;
    composerSnapshot: ReturnType<typeof snapshotComposer>;
    queryClient: QueryClient;
    requestScrollToLatest: () => void;
    sendStreamMessage: UseChatComposerSubmitParams["sendStreamMessage"];
    sessionId: number;
    signal: AbortSignal;
    t: (key: string) => string;
    workingAttachments: ReturnType<typeof snapshotComposer>["attachments"];
  },
  onAttachmentPatch: (attachmentId: string, patch: Record<string, unknown>) => void,
) {
  const {
    cacheWriter,
    clientRequestId,
    composerSnapshot,
    queryClient,
    requestScrollToLatest,
    sendStreamMessage,
    sessionId,
    signal,
    t,
    workingAttachments,
  } = deps;

  const { uploadedAttachments: persistedAttachments, uploadedCount } =
    await uploadQueuedChatAttachments({
      attachments: workingAttachments.filter((item) => item.status !== MessageStatus.FAILED),
      failedMessage: t("attachmentUploadFailed"),
      onPatch: onAttachmentPatch,
      signal,
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
    clientRequestId,
    sessionId,
    content: composerSnapshot.draft,
    signal,
  });

  if (streamResult.userMessageId && serializedAttachments.length > 0) {
    const patched = cacheWriter.patchUserMessageAttachments({
      attachments: persistedChatAttachments,
      sessionId,
      userMessageId: streamResult.userMessageId,
    });
    cacheWriter.patchSessionContext({
      attachments: persistedChatAttachments,
      sessionId,
    });
    if (!patched) {
      await cacheWriter.invalidateSessionArtifacts(sessionId);
    }
    void invalidateDocuments(queryClient);
  }
}

function resolveRetryContext(
  message: ChatMessageItem,
  messages: ChatMessageItem[],
  findRunByAssistantMessageId: UseChatComposerSubmitParams["findRunByAssistantMessageId"],
) {
  const retryOfMessageId =
    message.role === MessageRole.ASSISTANT ? (message.reply_to_message_id ?? null) : message.id;

  const retryContent =
    message.role === MessageRole.ASSISTANT
      ? (messages.find((item) => item.id === retryOfMessageId)?.content ??
        findRunByAssistantMessageId(message.id)?.userContent ??
        message.content)
      : message.content;

  const retryAttachments =
    message.role === MessageRole.ASSISTANT
      ? (messages.find((item) => item.id === retryOfMessageId)?.attachments ?? null)
      : (message.attachments ?? null);

  return { retryAttachments, retryContent, retryOfMessageId };
}

export function useChatComposerSubmit({
  cacheWriter,
  findRunByAssistantMessageId,
  messages,
  requestScrollToLatest,
  resolvedActiveSessionId,
  runtime,
  sendStreamMessage,
}: UseChatComposerSubmitParams) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();

  const submitMessage = useCallback(async () => {
    if (resolvedActiveSessionId === null) {
      return;
    }

    const sessionId = resolvedActiveSessionId;
    const submitController = new AbortController();
    const clientRequestId = crypto.randomUUID();
    if (!runtime.beginSubmit(sessionId, submitController, clientRequestId)) {
      return;
    }

    const composerSnapshot = snapshotComposer(sessionId);
    const sendableAttachments = composerSnapshot.attachments.filter(
      (attachment) => attachment.status !== MessageStatus.FAILED,
    );

    if (!composerSnapshot.draft.trim() && sendableAttachments.length === 0) {
      runtime.finishSubmit(sessionId);
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
      await performAttachmentUploadAndSend(
        {
          cacheWriter,
          clientRequestId,
          composerSnapshot,
          queryClient,
          requestScrollToLatest,
          sendStreamMessage,
          sessionId,
          signal: submitController.signal,
          t,
          workingAttachments,
        },
        (attachmentId, patch) => {
          const targetAttachment = workingAttachments.find((item) => item.id === attachmentId);
          if (!targetAttachment) {
            return;
          }
          Object.assign(targetAttachment, patch);
        },
      );
    } catch {
      restoreComposerSnapshot();
      return;
    } finally {
      runtime.finishSubmit(sessionId);
    }
  }, [
    cacheWriter,
    queryClient,
    requestScrollToLatest,
    resolvedActiveSessionId,
    runtime,
    sendStreamMessage,
    t,
  ]);

  const retryMessage = useCallback(
    async (message: ChatMessageItem) => {
      if (resolvedActiveSessionId === null) {
        return;
      }

      const sessionId = resolvedActiveSessionId;
      const submitController = new AbortController();
      const clientRequestId = crypto.randomUUID();
      if (!runtime.beginSubmit(sessionId, submitController, clientRequestId)) {
        return;
      }

      const { retryAttachments, retryContent, retryOfMessageId } = resolveRetryContext(
        message,
        messages,
        findRunByAssistantMessageId,
      );

      if (retryOfMessageId === null) {
        runtime.finishSubmit(sessionId);
        return;
      }

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
          clientRequestId,
          sessionId,
          content: retryContent,
          retryOfMessageId,
          signal: submitController.signal,
        });
      } catch {
        if (shouldResetComposerSnapshot) {
          restoreComposer(sessionId, composerSnapshot);
        }
        return;
      } finally {
        runtime.finishSubmit(sessionId);
      }
    },
    [
      findRunByAssistantMessageId,
      messages,
      requestScrollToLatest,
      resolvedActiveSessionId,
      runtime,
      sendStreamMessage,
    ],
  );

  return {
    retryMessage,
    submitMessage,
  };
}
