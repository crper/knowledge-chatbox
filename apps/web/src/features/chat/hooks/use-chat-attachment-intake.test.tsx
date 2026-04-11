import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FileRejection } from "react-dropzone";

import { I18nProvider } from "@/providers/i18n-provider";
import { createTestQueryClient } from "@/test/query-client";
import { useChatComposerStore } from "../store/chat-composer-store";
import { useChatAttachmentIntake } from "./use-chat-attachment-intake";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = useChatComposerStore as any;

function AttachmentIntakeHost({
  resolvedActiveSessionId,
}: {
  resolvedActiveSessionId: number | null;
}) {
  const { attachFiles, rejectFiles } = useChatAttachmentIntake({
    resolvedActiveSessionId,
  });

  return (
    <div>
      <button
        onClick={() =>
          attachFiles([
            new File(["hello"], "notes.md", { type: "text/markdown" }),
            new File(["hello"], "notes.md", { type: "text/markdown" }),
          ])
        }
        type="button"
      >
        attach
      </button>
      <button
        onClick={() =>
          rejectFiles([
            {
              errors: [{ code: "file-invalid-type", message: "bad type" }],
              file: new File(["bad"], "virus.exe", { type: "application/octet-stream" }),
            } satisfies FileRejection,
          ])
        }
        type="button"
      >
        reject
      </button>
    </div>
  );
}

describe("useChatAttachmentIntake", () => {
  it("deduplicates accepted files within the active session", async () => {
    const queryClient = createTestQueryClient();

    store.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });

    render(
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AttachmentIntakeHost resolvedActiveSessionId={7} />
        </QueryClientProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "attach" }));

    await waitFor(() => {
      expect(useChatComposerStore.getState().attachmentsBySession["7"]).toHaveLength(1);
    });
  });

  it("stores rejected files as failed attachments and shows a toast", async () => {
    const queryClient = createTestQueryClient();
    const errorSpy = vi.spyOn(toast, "error");

    store.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });

    render(
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AttachmentIntakeHost resolvedActiveSessionId={7} />
        </QueryClientProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "reject" }));

    await waitFor(() => {
      expect(useChatComposerStore.getState().attachmentsBySession["7"]).toHaveLength(1);
      expect(useChatComposerStore.getState().attachmentsBySession["7"]?.[0]).toMatchObject({
        kind: "document",
        name: "virus.exe",
        status: "failed",
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  it("shows error toast when attaching files without active session", () => {
    const queryClient = createTestQueryClient();
    const errorSpy = vi.spyOn(toast, "error");

    store.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });

    render(
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AttachmentIntakeHost resolvedActiveSessionId={null} />
        </QueryClientProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "attach" }));

    // 验证没有添加附件
    expect(useChatComposerStore.getState().attachmentsBySession).toEqual({});
    // 验证显示了错误提示（i18n 会将其翻译成中文）
    expect(errorSpy).toHaveBeenCalledWith("请先选择一个会话后再添加附件。");
  });
});
