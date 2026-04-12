import { expectTypeOf } from "vite-plus/test";

import {
  CHAT_DRAFTS_STORAGE_KEY,
  CHAT_SEND_SHORTCUT_STORAGE_KEY,
  useChatComposerStore,
} from "@/features/chat/store/chat-composer-store";

describe("useChatComposerStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatComposerStore.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("暴露 persist 辅助接口供测试与重置逻辑复用", () => {
    expectTypeOf(useChatComposerStore.persist.clearStorage).toEqualTypeOf<() => void>();
    expectTypeOf(useChatComposerStore.persist.rehydrate).toEqualTypeOf<
      () => Promise<void> | void
    >();
  });

  it("keeps session-scoped draft and attachments in the same store owner", () => {
    useChatComposerStore.getState().setDraft(7, "draft question");
    useChatComposerStore.getState().addAttachment(7, {
      id: "attachment-1",
      kind: "document",
      name: "notes.md",
      status: "queued",
    });

    expect(useChatComposerStore.getState()).toMatchObject({
      attachmentsBySession: {
        "7": [
          {
            id: "attachment-1",
            kind: "document",
            name: "notes.md",
            status: "queued",
          },
        ],
      },
      draftsBySession: {
        "7": "draft question",
      },
      sendShortcut: "enter",
    });
  });

  it("persists only drafts and send shortcut, but never attachments", async () => {
    useChatComposerStore.getState().setDraft(7, "persisted draft");
    useChatComposerStore.getState().setSendShortcut("shift-enter");
    useChatComposerStore.getState().addAttachment(7, {
      id: "attachment-1",
      kind: "document",
      name: "secret.pdf",
      status: "queued",
    });

    await vi.runAllTimersAsync();

    expect(window.localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY)).toContain("persisted draft");
    expect(window.localStorage.getItem(CHAT_SEND_SHORTCUT_STORAGE_KEY)).toBe("shift-enter");
    expect(window.localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY)).not.toContain("secret.pdf");

    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });

    await useChatComposerStore.persist.rehydrate();

    expect(useChatComposerStore.getState()).toMatchObject({
      attachmentsBySession: {},
      draftsBySession: {
        "7": "persisted draft",
      },
      sendShortcut: "shift-enter",
    });
  });
});
