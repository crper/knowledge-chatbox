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

  const hasImageAttachment = (message.attachments_json ?? []).some(
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

export function buildMessageRowModel(message: ChatMessageItem, t: (key: string) => string) {
  const isUserMessage = message.role === MessageRole.USER;
  const isAssistantMessage = message.role === MessageRole.ASSISTANT;
  const canRetry =
    message.status === MessageStatus.FAILED &&
    (isUserMessage || message.reply_to_message_id != null);
  const assistantContent =
    message.content.trim().length > 0
      ? message.content
      : message.status === MessageStatus.FAILED
        ? t("assistantFailedFallback")
        : t("assistantStreamingFallback");
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
      label: isUserMessage
        ? t("messageStatusUserReady")
        : isAssistantMessage
          ? t("messageStatusAssistantReady")
          : t("messageStatusSystemReady"),
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
