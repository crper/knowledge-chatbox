import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FileRejection } from "react-dropzone";

import { I18nProvider } from "@/providers/i18n-provider";
import { createTestQueryClient } from "@/test/query-client";
import { useChatUiStore } from "../store/chat-ui-store";
import { useChatAttachmentIntake } from "./use-chat-attachment-intake";

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

    useChatUiStore.setState({
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
      expect(useChatUiStore.getState().attachmentsBySession["7"]).toHaveLength(1);
    });
  });

  it("stores rejected files as failed attachments and shows a toast", async () => {
    const queryClient = createTestQueryClient();
    const errorSpy = vi.spyOn(toast, "error");

    useChatUiStore.setState({
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
      expect(useChatUiStore.getState().attachmentsBySession["7"]).toHaveLength(1);
      expect(useChatUiStore.getState().attachmentsBySession["7"]?.[0]).toMatchObject({
        kind: "document",
        name: "virus.exe",
        status: "failed",
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
