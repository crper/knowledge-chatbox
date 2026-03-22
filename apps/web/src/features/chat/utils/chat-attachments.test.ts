import type { ChatAttachmentItem } from "../store/chat-ui-store";
import { getReadyChatAttachments, hasReadyChatAttachments } from "./chat-attachments";

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
  it("keeps only attachments that are ready for streaming and archiving", () => {
    const readyFile = new File(["hello"], "image.png", { type: "image/png" });
    const attachments = [
      createAttachment({
        file: readyFile,
        mimeType: "image/png",
        progress: 100,
        resourceDocumentId: 7,
        resourceDocumentVersionId: 9,
        sizeBytes: readyFile.size,
        status: "uploaded",
      }),
      createAttachment({
        id: "att-2",
        file: readyFile,
        status: "failed",
      }),
      createAttachment({
        id: "att-3",
        mimeType: "image/png",
      }),
    ];

    expect(getReadyChatAttachments(attachments)).toEqual([
      expect.objectContaining({
        id: "att-1",
        file: readyFile,
        mimeType: "image/png",
        progress: 100,
        resourceDocumentId: 7,
        resourceDocumentVersionId: 9,
        status: "uploaded",
      }),
    ]);
  });

  it("reports whether the composer has at least one ready attachment", () => {
    expect(hasReadyChatAttachments([createAttachment({ status: "failed" })])).toBe(false);
    expect(
      hasReadyChatAttachments([
        createAttachment({
          file: new File(["hello"], "image.png", { type: "image/png" }),
          mimeType: "image/png",
          resourceDocumentId: 7,
          resourceDocumentVersionId: 9,
          status: "uploaded",
        }),
      ]),
    ).toBe(true);
  });
});
