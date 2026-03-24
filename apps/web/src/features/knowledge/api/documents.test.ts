import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { jsonResponse } from "@/test/http";
import {
  buildApiUrl,
  deleteDocument,
  getDocumentVersions,
  getDocuments,
  uploadDocument,
} from "./documents";

function apiPath(path: string) {
  return expect.stringMatching(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

type MockUploadTarget = {
  onprogress: ((event: ProgressEvent<EventTarget>) => void) | null;
};

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  headers: Record<string, string> = {};
  method = "";
  onabort: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onerror: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onload: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  requestBody: Document | XMLHttpRequestBodyInit | null = null;
  responseText = "";
  status = 0;
  statusText = "";
  upload: MockUploadTarget = { onprogress: null };
  url = "";
  withCredentials = false;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.requestBody = body;
  }

  abort() {
    this.onabort?.(new ProgressEvent("abort"));
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent<EventTarget>);
  }

  respond(status: number, responseText: string, statusText = "OK") {
    this.status = status;
    this.responseText = responseText;
    this.statusText = statusText;
    this.onload?.(new ProgressEvent("load"));
  }

  fail() {
    this.onerror?.(new ProgressEvent("error"));
  }
}

describe("documents api", () => {
  beforeEach(() => {
    setAccessToken(null);
    MockXMLHttpRequest.instances = [];
    vi.restoreAllMocks();
  });

  it("gets latest documents list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: 7,
            space_id: 2,
            title: "spec.md",
            logical_name: "spec.md",
            status: "active",
            latest_revision: {
              id: 2,
              document_id: 7,
              revision_no: 1,
              source_filename: "spec.md",
              mime_type: "text/markdown",
              file_type: "md",
              ingest_status: "indexed",
              content_hash: "hash-1",
              source_path: "/uploads/spec.md",
              normalized_path: "/normalized/spec.md",
              file_size: 12,
              chunk_count: 3,
              error_message: null,
              supersedes_revision_id: null,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              created_at: "2026-03-19T08:00:00Z",
              updated_at: "2026-03-19T09:00:00Z",
              indexed_at: "2026-03-19T09:00:00Z",
            },
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
          },
        ],
        error: null,
      }),
    );
    const result = await getDocuments();

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/documents"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 2, document_id: 7, name: "spec.md", is_latest: true }),
    ]);
  });

  it("gets versions for one document", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: 1,
            document_id: 2,
            revision_no: 1,
            source_filename: "spec-v1.md",
            mime_type: "text/markdown",
            file_type: "md",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/spec-v1.md",
            normalized_path: "/normalized/spec-v1.md",
            file_size: 12,
            chunk_count: 3,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
          {
            id: 2,
            document_id: 2,
            revision_no: 2,
            source_filename: "spec-v2.md",
            mime_type: "text/markdown",
            file_type: "md",
            ingest_status: "indexed",
            content_hash: "hash-2",
            source_path: "/uploads/spec-v2.md",
            normalized_path: "/normalized/spec-v2.md",
            file_size: 13,
            chunk_count: 4,
            error_message: null,
            supersedes_revision_id: 1,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T10:00:00Z",
            updated_at: "2026-03-19T11:00:00Z",
            indexed_at: "2026-03-19T11:00:00Z",
          },
        ],
        error: null,
      }),
    );
    const result = await getDocumentVersions(2);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/documents/2/revisions"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toHaveLength(2);
    expect(result[1]?.version).toBe(2);
  });

  it("uploads a document with progress callbacks and credentials", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    setAccessToken("upload-token");
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const onProgress = vi.fn();

    const uploadPromise = uploadDocument(file, { onProgress });
    const xhr = MockXMLHttpRequest.instances[0]!;

    xhr.emitProgress(5, 10);
    xhr.emitProgress(10, 10);
    xhr.respond(
      201,
      JSON.stringify({
        success: true,
        data: {
          deduplicated: false,
          document: {
            id: 7,
            space_id: 2,
            title: "note.txt",
            logical_name: "note.txt",
            status: "active",
            latest_revision: {
              id: 3,
              document_id: 7,
              revision_no: 1,
              source_filename: "note.txt",
              mime_type: "text/plain",
              file_type: "txt",
              ingest_status: "indexed",
              content_hash: "hash-1",
              source_path: "/uploads/note.txt",
              normalized_path: "/normalized/note.txt",
              file_size: 5,
              chunk_count: 1,
              error_message: null,
              supersedes_revision_id: null,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              created_at: "2026-03-19T08:00:00Z",
              updated_at: "2026-03-19T09:00:00Z",
              indexed_at: "2026-03-19T09:00:00Z",
            },
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
          },
          latest_revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
          revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
        },
        error: null,
      }),
    );

    await expect(uploadPromise).resolves.toEqual(
      expect.objectContaining({
        id: 3,
        document_id: 7,
        deduplicated: false,
        name: "note.txt",
      }),
    );
    expect(xhr.method).toBe("POST");
    expect(xhr.url.endsWith("/api/documents/upload")).toBe(true);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers.Authorization).toBe("Bearer upload-token");
    expect(xhr.requestBody).toBeInstanceOf(FormData);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
  });

  it("builds a same-origin relative upload path when no API origin is configured", () => {
    expect(buildApiUrl("/api/documents/upload", "")).toBe("/api/documents/upload");
    expect(buildApiUrl("/api/documents/upload", "http://localhost:8000")).toBe(
      "http://localhost:8000/api/documents/upload",
    );
    expect(buildApiUrl("/api/documents/upload", "http://localhost:8000/")).toBe(
      "http://localhost:8000/api/documents/upload",
    );
  });

  it("refreshes the access token and retries the upload after an unauthorized response", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    setAccessToken("expired-token");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          access_token: "fresh-token",
          expires_in: 900,
          token_type: "Bearer",
        },
        error: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const uploadPromise = uploadDocument(file);
    const firstXhr = MockXMLHttpRequest.instances[0]!;

    firstXhr.respond(
      401,
      JSON.stringify({
        success: false,
        data: null,
        error: { code: "unauthorized", message: "Authentication required." },
      }),
      "Unauthorized",
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/refresh"),
      expect.objectContaining({ method: "POST" }),
    );

    expect(MockXMLHttpRequest.instances).toHaveLength(2);
    const retryXhr = MockXMLHttpRequest.instances[1]!;
    expect(retryXhr.headers.Authorization).toBe("Bearer fresh-token");

    retryXhr.respond(
      201,
      JSON.stringify({
        success: true,
        data: {
          deduplicated: false,
          document: {
            id: 7,
            space_id: 2,
            title: "note.txt",
            logical_name: "note.txt",
            status: "active",
            latest_revision: {
              id: 3,
              document_id: 7,
              revision_no: 1,
              source_filename: "note.txt",
              mime_type: "text/plain",
              file_type: "txt",
              ingest_status: "indexed",
              content_hash: "hash-1",
              source_path: "/uploads/note.txt",
              normalized_path: "/normalized/note.txt",
              file_size: 5,
              chunk_count: 1,
              error_message: null,
              supersedes_revision_id: null,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              created_at: "2026-03-19T08:00:00Z",
              updated_at: "2026-03-19T09:00:00Z",
              indexed_at: "2026-03-19T09:00:00Z",
            },
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
          },
          latest_revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
          revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
        },
        error: null,
      }),
    );

    await expect(uploadPromise).resolves.toEqual(
      expect.objectContaining({
        id: 3,
        document_id: 7,
        deduplicated: false,
        name: "note.txt",
      }),
    );
    expect(getAccessToken()).toBe("fresh-token");
  });

  it("returns dedupe metadata when backend short-circuits duplicate uploads", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const file = new File(["hello"], "note.txt", { type: "text/plain" });

    const uploadPromise = uploadDocument(file);
    const xhr = MockXMLHttpRequest.instances[0]!;

    xhr.respond(
      200,
      JSON.stringify({
        success: true,
        data: {
          deduplicated: true,
          document: {
            id: 7,
            space_id: 2,
            title: "note.txt",
            logical_name: "note.txt",
            status: "active",
            latest_revision: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
          },
          latest_revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
          revision: {
            id: 3,
            document_id: 7,
            revision_no: 1,
            source_filename: "note.txt",
            mime_type: "text/plain",
            file_type: "txt",
            ingest_status: "indexed",
            content_hash: "hash-1",
            source_path: "/uploads/note.txt",
            normalized_path: "/normalized/note.txt",
            file_size: 5,
            chunk_count: 1,
            error_message: null,
            supersedes_revision_id: null,
            created_by_user_id: 1,
            updated_by_user_id: 1,
            created_at: "2026-03-19T08:00:00Z",
            updated_at: "2026-03-19T09:00:00Z",
            indexed_at: "2026-03-19T09:00:00Z",
          },
        },
        error: null,
      }),
    );

    await expect(uploadPromise).resolves.toEqual(
      expect.objectContaining({
        deduplicated: true,
        id: 3,
        version: 1,
      }),
    );
  });

  it("surfaces structured error text when upload returns non-json server error", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const uploadPromise = uploadDocument(file);
    const xhr = MockXMLHttpRequest.instances[0]!;

    xhr.respond(500, "Internal Server Error", "Internal Server Error");

    await expect(uploadPromise).rejects.toThrow("服务暂时不可用，请稍后重试。");
  });

  it("surfaces structured payload errors from upload responses", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const uploadPromise = uploadDocument(file);
    const xhr = MockXMLHttpRequest.instances[0]!;

    xhr.respond(
      400,
      JSON.stringify({
        detail: {
          code: "unsupported_file_type",
          message: "仅支持 txt、md、pdf、docx 和常见图片格式。",
        },
      }),
      "Bad Request",
    );

    await expect(uploadPromise).rejects.toThrow("仅支持 txt、md、pdf、docx 和常见图片格式。");
  });

  it("deletes a document", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, data: { status: "ok" }, error: null }));

    await deleteDocument(7);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/documents/7"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
