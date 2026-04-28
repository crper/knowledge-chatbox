import type { ChatMessageItem } from "../api/chat";
import { MessageRole, MessageStatus, isStreamingStatus } from "../constants";

const IMAGE_ATTACHMENT_ERROR_PATTERNS = [
  /attached image could not be processed/i,
  /failed to process inputs:\s*image/i,
  /image:\s*unknown format/i,
] as const;

function getUserFacingMessageError(message: ChatMessageItem, t: (key: string) => string) {
  const rawErrorMessage = message.error_message?.trim();
  if (!rawErrorMessage) {
    return null;
  }

  const hasImageAttachment = (message.attachments ?? []).some(
    (attachment) => attachment.type === "image",
  );
  if (
    hasImageAttachment &&
    IMAGE_ATTACHMENT_ERROR_PATTERNS.some((pattern) => pattern.test(rawErrorMessage))
  ) {
    return t("attachmentImageProcessingFailed");
  }

  return rawErrorMessage;
}

function resolveAssistantContent(message: ChatMessageItem, t: (key: string) => string): string {
  if (message.content.trim().length > 0) return message.content;
  if (message.status === MessageStatus.FAILED) return t("assistantFailedFallback");
  return t("assistantStreamingFallback");
}

function resolveReadyStatusLabel(
  isUserMessage: boolean,
  isAssistantMessage: boolean,
  t: (key: string) => string,
): string {
  if (isUserMessage) return t("messageStatusUserReady");
  if (isAssistantMessage) return t("messageStatusAssistantReady");
  return t("messageStatusSystemReady");
}

export function buildMessageRowModel(message: ChatMessageItem, t: (key: string) => string) {
  const isUserMessage = message.role === MessageRole.USER;
  const isAssistantMessage = message.role === MessageRole.ASSISTANT;
  const canRetry =
    message.status === MessageStatus.FAILED &&
    (isUserMessage || message.reply_to_message_id != null);
  const assistantContent = resolveAssistantContent(message, t);
  const displayErrorMessage = getUserFacingMessageError(message, t);
  let statusMeta: { label: string; tone: "error" | "pending" | "default" };
  if (message.status === MessageStatus.FAILED) {
    statusMeta = {
      label: isUserMessage ? t("messageStatusUserFailed") : t("messageStatusAssistantFailed"),
      tone: "error",
    };
  } else if (isAssistantMessage && isStreamingStatus(message.status)) {
    statusMeta = {
      label: t("assistantStreamingStatus"),
      tone: "pending",
    };
  } else {
    statusMeta = {
      label: resolveReadyStatusLabel(isUserMessage, isAssistantMessage, t),
      tone: "default",
    };
  }

  return {
    assistantContent,
    canRetry,
    displayErrorMessage,
    isAssistantMessage,
    isUserMessage,
    messageLabelStyle: isAssistantMessage ? "badge" : "tag",
    statusMeta,
  };
}
