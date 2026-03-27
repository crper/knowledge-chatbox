import type { FileRejection } from "react-dropzone";

import {
  getDocumentUploadErrorMessage,
  getDocumentUploadRejectionMessage,
  runDocumentUpload,
} from "./document-upload";

describe("document upload workflow", () => {
  it("maps unsupported file rejections to the provided unsupported message", () => {
    const rejection = {
      errors: [{ code: "file-invalid-type", message: "bad type" }],
      file: new File(["content"], "bad.exe", { type: "application/octet-stream" }),
    } satisfies FileRejection;

    expect(
      getDocumentUploadRejectionMessage(rejection, {
        failedMessage: "上传失败",
        unsupportedFileTypeMessage: "不支持的文件类型",
      }),
    ).toBe("不支持的文件类型");
  });

  it("runs the shared upload lifecycle with standard patches", async () => {
    const patches: Array<Record<string, unknown>> = [];

    const result = await runDocumentUpload({
      file: new File(["hello"], "note.txt", { type: "text/plain" }),
      failedMessage: "上传失败",
      onPatch: (patch) => patches.push(patch),
      upload: async (_file, options) => {
        options?.onProgress?.(40);
        options?.onProgress?.(100);
        return { id: 7, name: "note.txt" };
      },
    });

    expect(result).toEqual({ id: 7, name: "note.txt" });
    expect(patches).toEqual([
      { errorMessage: undefined, progress: 0, status: "uploading" },
      { progress: 40, status: "uploading" },
      { progress: 100, status: "uploading" },
      { errorMessage: undefined, progress: 100, status: "uploaded" },
    ]);
  });

  it("applies a failed patch and throws a user-facing message on upload errors", async () => {
    const patches: Array<Record<string, unknown>> = [];

    await expect(
      runDocumentUpload({
        file: new File(["hello"], "note.txt", { type: "text/plain" }),
        failedMessage: "上传失败",
        onPatch: (patch) => patches.push(patch),
        upload: async () => {
          throw new Error("网络中断");
        },
      }),
    ).rejects.toThrow("网络中断");

    expect(patches).toEqual([
      { errorMessage: undefined, progress: 0, status: "uploading" },
      { errorMessage: "网络中断", progress: 0, status: "failed" },
    ]);
    expect(getDocumentUploadErrorMessage(new Error("网络中断"), "上传失败")).toBe("网络中断");
  });
});
