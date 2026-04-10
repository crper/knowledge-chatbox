import type { KnowledgeDocument } from "@/features/knowledge/api/documents";
import type { ComposerAttachmentItem } from "../store/chat-attachment-store";
import { uploadQueuedChatAttachments } from "./upload-chat-attachments";

function buildQueuedAttachment(id: string, name: string): ComposerAttachmentItem {
  return {
    id,
    file: new File(["hello"], name, { type: "image/png" }),
    kind: "image",
    mimeType: "image/png",
    name,
    status: "queued",
  };
}

function buildKnowledgeDocument(
  input: Partial<KnowledgeDocument> & Pick<KnowledgeDocument, "document_id" | "id" | "name">,
): KnowledgeDocument {
  const { document_id, id, name, ...rest } = input;

  return {
    chunk_count: 1,
    created_at: "2026-03-30T00:00:00Z",
    document_id,
    file_type: "png",
    id,
    is_latest: true,
    name,
    status: "indexed",
    updated_at: "2026-03-30T00:00:00Z",
    version: 1,
    ...rest,
  };
}

describe("uploadQueuedChatAttachments", () => {
  it("uploads queued attachments with bounded concurrency while preserving order", async () => {
    const attachments = [
      buildQueuedAttachment("a", "a.png"),
      buildQueuedAttachment("b", "b.png"),
      buildQueuedAttachment("c", "c.png"),
    ];
    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const finishers: Record<string, () => void> = {};

    const uploadPromise = uploadQueuedChatAttachments({
      attachments,
      concurrency: 2,
      onPatch: (attachmentId, patch) => {
        patches.push({ id: attachmentId, patch });
      },
      uploadFile: (attachment) =>
        new Promise<KnowledgeDocument>((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          const finish = () => {
            inFlight -= 1;
            resolve(
              buildKnowledgeDocument({
                document_id: Number(`${attachment.id.charCodeAt(0)}`),
                id: Number(`${attachment.id.charCodeAt(0)}1`),
                name: attachment.name,
              }),
            );
          };

          if (attachment.id === "a") {
            finishers.a = finish;
            return;
          }
          if (attachment.id === "b") {
            finishers.b = finish;
            return;
          }
          finishers.c = finish;
        }),
    });

    expect(finishers.a).toBeDefined();
    expect(finishers.b).toBeDefined();
    expect(finishers.c).toBeUndefined();
    finishers.b!();
    await Promise.resolve();
    expect(finishers.c).toBeDefined();
    finishers.a!();
    finishers.c!();

    const result = await uploadPromise;

    expect(maxInFlight).toBe(2);
    expect(result.uploadedAttachments.map((attachment) => attachment.id)).toEqual(["a", "b", "c"]);
    expect(result.uploadedCount).toBe(3);
    expect(patches.some(({ id, patch }) => id === "a" && patch.status === "uploaded")).toBe(true);
  });

  it("stops launching new uploads after the first failure but waits for in-flight uploads to settle", async () => {
    const attachments = [
      buildQueuedAttachment("a", "a.png"),
      buildQueuedAttachment("b", "b.png"),
      buildQueuedAttachment("c", "c.png"),
    ];
    let inFlight = 0;
    let maxInFlight = 0;
    let startedIds: string[] = [];
    const signals: {
      rejectB?: (reason?: unknown) => void;
      resolveA?: () => void;
    } = {};
    let startedC = false;

    const uploadPromise = uploadQueuedChatAttachments({
      attachments,
      concurrency: 2,
      onPatch: () => {},
      uploadFile: (attachment) =>
        new Promise<KnowledgeDocument>((resolve, reject) => {
          startedIds.push(attachment.id);
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);

          if (attachment.id === "a") {
            signals.resolveA = () => {
              inFlight -= 1;
              resolve(buildKnowledgeDocument({ document_id: 1, id: 11, name: attachment.name }));
            };
            return;
          }

          if (attachment.id === "b") {
            signals.rejectB = (reason) => {
              inFlight -= 1;
              reject(reason);
            };
            return;
          }

          startedC = true;
          inFlight -= 1;
          resolve(buildKnowledgeDocument({ document_id: 3, id: 31, name: attachment.name }));
        }),
    });

    signals.rejectB?.(new Error("upload failed"));
    signals.resolveA?.();

    await expect(uploadPromise).rejects.toThrow("upload failed");

    expect(maxInFlight).toBe(2);
    expect(startedIds).toEqual(["a", "b"]);
    expect(startedC).toBe(false);
  });
});
