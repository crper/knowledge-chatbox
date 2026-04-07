import { i18n } from "@/i18n";
import type { ChatMessageItem } from "../api/chat";
import { buildMessageRowModel } from "./build-message-row-model";

function t(key: string) {
  return i18n.getFixedT("zh-CN", "chat")(key);
}

describe("buildMessageRowModel", () => {
  it("maps assistant image-processing failures to the user-facing localized message", () => {
    const message: ChatMessageItem = {
      id: 1,
      role: "user",
      content: "这张图怎么解析",
      status: "failed",
      error_message: "image: unknown format (500)",
      attachments_json: [
        {
          attachment_id: "img-1",
          type: "image",
          name: "failed.png",
          mime_type: "image/png",
          size_bytes: 1,
        },
      ],
      sources_json: [],
    };

    expect(buildMessageRowModel(message, t).displayErrorMessage).toBe(
      "图片暂时无法处理。请确认图片可正常打开，并切换到支持图片理解的模型后重试。",
    );
  });

  it("provides assistant fallback content and pending status meta while streaming", () => {
    const message: ChatMessageItem = {
      id: 2,
      role: "assistant",
      content: "",
      status: "streaming",
      sources_json: [],
    };

    expect(buildMessageRowModel(message, t)).toMatchObject({
      assistantContent: "正在生成回答...",
      canRetry: false,
      statusMeta: {
        label: "正在生成回答",
        tone: "pending",
      },
    });
  });

  it("enables retry for failed assistant replies that have a reply target", () => {
    const message: ChatMessageItem = {
      id: 3,
      role: "assistant",
      content: "",
      status: "failed",
      reply_to_message_id: 2,
      sources_json: [],
    };

    expect(buildMessageRowModel(message, t)).toMatchObject({
      assistantContent: "本次回复生成失败，请点击重试或重新提问。",
      canRetry: true,
      statusMeta: {
        label: "生成失败",
        tone: "error",
      },
    });
  });
});
