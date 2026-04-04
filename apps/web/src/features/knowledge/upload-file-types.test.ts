import {
  detectSupportedUploadKind,
  SUPPORTED_UPLOAD_ACCEPT_MAP,
  UNSUPPORTED_UPLOAD_FILE_ERROR_CODE,
  validateUploadFile,
} from "./upload-file-types";

describe("upload file types", () => {
  it("detects supported kinds from mime type first", () => {
    expect(detectSupportedUploadKind(new File(["hello"], "note.txt", { type: "text/plain" }))).toBe(
      "document",
    );
    expect(
      detectSupportedUploadKind(new File(["hello"], "photo.webp", { type: "image/webp" })),
    ).toBe("image");
  });

  it("falls back to filename extensions when the browser omits mime type", () => {
    expect(detectSupportedUploadKind(new File(["hello"], "report.docx"))).toBe("document");
    expect(detectSupportedUploadKind(new File(["hello"], "cover.jpeg"))).toBe("image");
    expect(detectSupportedUploadKind(new File(["hello"], "archive.zip"))).toBeNull();
  });

  it("returns a shared unsupported-file error for invalid uploads", () => {
    expect(
      validateUploadFile(new File(["hello"], "archive.zip", { type: "application/zip" })),
    ).toEqual({
      code: UNSUPPORTED_UPLOAD_FILE_ERROR_CODE,
      message: UNSUPPORTED_UPLOAD_FILE_ERROR_CODE,
    });
  });

  it("exposes the shared accept map for dropzones", () => {
    expect(SUPPORTED_UPLOAD_ACCEPT_MAP).toMatchObject({
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "text/plain": [".txt"],
    });
  });
});
