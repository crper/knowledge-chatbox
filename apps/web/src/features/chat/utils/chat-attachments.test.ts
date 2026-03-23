import type { ChatAttachmentItem } from "../store/chat-ui-store";
import { hasSendableChatAttachments } from "./chat-attachments";

function createAttachment(overrides: Partial<ChatAttachmentItem> = {}): ChatAttachmentItem {
  return {
    id: "att-1",
    kind: "image",
    name: "image.png",
    status: "queued",
    ...overrides,
  };
}

describe("chat attachment utils", () => {
  it("reports whether the composer has at least one sendable attachment", () => {
    expect(hasSendableChatAttachments([createAttachment({ status: "failed" })])).toBe(false);
    expect(hasSendableChatAttachments([createAttachment({ status: "queued" })])).toBe(true);
    expect(
      hasSendableChatAttachments([
        createAttachment({
          status: "uploaded",
        }),
      ]),
    ).toBe(true);
  });
});
