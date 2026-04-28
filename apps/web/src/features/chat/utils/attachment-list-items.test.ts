import { i18n } from "@/i18n";
import type { ChatAttachmentItem as ChatMessageAttachmentItem } from "../api/chat";
import type { ComposerAttachmentItem as ChatComposerAttachmentItem } from "../store/chat-composer-store";
import {
  buildAttachmentPreviewIndexes,
  buildChatAttachmentDescriptors,
  buildChatAttachmentListItems,
  buildChatImageViewerItems,
  buildComposerAttachmentListItems,
  buildComposerImageViewerItems,
} from "./attachment-list-items";

describe("attachment-list-items", () => {
  it("collapses opaque image names into session attachment labels", () => {
    expect(
      buildChatAttachmentDescriptors([
        {
          attachment_id: "remote-image",
          type: "image",
          name: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
          mime_type: "image/png",
          document_revision_id: 11,
          size_bytes: 1,
        },
      ])[0],
    ).toMatchObject({
      displayName: "会话图片附件 1",
      rawName: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
    });
  });

  it("does not collapse uppercase extensions", () => {
    expect(
      buildChatAttachmentDescriptors([
        {
          attachment_id: "remote-image",
          type: "image",
          name: "f2280f620f9045129491d54f4de3997d.PNG",
          mime_type: "image/png",
          document_revision_id: 11,
          size_bytes: 1,
        },
      ])[0],
    ).toMatchObject({
      displayName: "f2280f620f9045129491d54f4de3997d.PNG",
      rawName: undefined,
    });
  });

  it("uses the current locale for collapsed opaque image labels", async () => {
    await i18n.changeLanguage("en");

    try {
      expect(
        buildChatAttachmentDescriptors([
          {
            attachment_id: "remote-image",
            type: "image",
            name: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
            mime_type: "image/png",
            document_revision_id: 11,
            size_bytes: 1,
          },
        ])[0],
      ).toMatchObject({
        displayName: "Session image attachment 1",
        rawName: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
      });
    } finally {
      await i18n.changeLanguage("zh-CN");
    }
  });

  it("builds previewable composer and chat attachment items", () => {
    const composerAttachments: ChatComposerAttachmentItem[] = [
      {
        id: "local-image",
        file: new File(["hello"], "image.png", { type: "image/png" }),
        kind: "image",
        mimeType: "image/png",
        name: "image.png",
        status: "queued",
      },
      {
        id: "local-document",
        file: new File(["hello"], "guide.pdf", { type: "application/pdf" }),
        kind: "document",
        mimeType: "application/pdf",
        name: "guide.pdf",
        status: "queued",
      },
    ];
    const messageAttachments: ChatMessageAttachmentItem[] = [
      {
        attachment_id: "remote-image",
        type: "image",
        name: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
        mime_type: "image/png",
        document_revision_id: 11,
        size_bytes: 1,
      },
      {
        attachment_id: "remote-document",
        type: "document",
        name: "夜航记录.pdf",
        mime_type: "application/pdf",
        document_revision_id: 21,
        size_bytes: 1,
      },
    ];

    const composerItems = buildComposerAttachmentListItems({
      attachments: composerAttachments,
      getStatusLabel: () => "待发送",
      onPreview: vi.fn(),
      onRemove: vi.fn(),
    });
    const chatItems = buildChatAttachmentDescriptors(messageAttachments);
    const composerViewerItems = buildComposerImageViewerItems(composerAttachments);
    const chatViewerItems = buildChatImageViewerItems(chatItems);
    const chatListItems = buildChatAttachmentListItems({
      descriptors: chatItems,
      onPreview: vi.fn(),
    });
    const previewIndexes = buildAttachmentPreviewIndexes(chatViewerItems);

    expect(composerItems).toHaveLength(2);
    expect(composerItems[0]).toMatchObject({
      displayName: "image.png",
      previewable: true,
      statusLabel: "待发送",
    });
    expect(composerItems[1]).toMatchObject({
      displayName: "guide.pdf",
      previewable: false,
    });
    expect(chatItems).toHaveLength(2);
    expect(chatItems[0]).toMatchObject({
      displayName: "会话图片附件 1",
      previewable: true,
    });
    expect(chatItems[1]).toMatchObject({
      displayName: "夜航记录.pdf",
      previewable: false,
    });
    expect(composerViewerItems).toMatchObject([
      {
        id: "local-image",
        kind: "local",
        mimeType: "image/png",
        name: "image.png",
      },
    ]);
    expect(chatViewerItems).toMatchObject([
      {
        displayName: "会话图片附件 1",
        id: "remote-image",
        kind: "remote",
        mimeType: "image/png",
        name: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
        documentRevisionId: 11,
      },
    ]);
    expect(chatListItems[0]?.onPreview).toBeTypeOf("function");
    expect(chatListItems[1]).toMatchObject({
      displayName: "夜航记录.pdf",
      previewable: false,
    });
    expect(previewIndexes.get("remote-image")).toBe(0);
  });
});
