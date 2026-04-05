import { setAccessToken } from "@/lib/auth/token-store";
import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import {
  buildApiUrl,
  deleteDocument,
  getDocumentListSummary,
  getDocumentUploadReadiness,
  getDocumentVersions,
  getDocuments,
  uploadDocument,
} from "./documents";

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

  simulateProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent<EventTarget>);
  }

  simulateResponse(status: number, responseText: string, statusText = "OK") {
    this.status = status;
    this.responseText = responseText;
    this.statusText = statusText;
    this.onload?.(new ProgressEvent("load"));
  }

  simulateError() {
    this.onerror?.(new ProgressEvent("error"));
  }

  static reset() {
    MockXMLHttpRequest.instances = [];
  }
}

describe("documents api", () => {
  beforeEach(() => {
    setAccessToken(null);
    MockXMLHttpRequest.reset();
  });

  afterEach(() => {
    MockXMLHttpRequest.reset();
  });

  it("gets document list", async () => {
    overrideHandler(
      http.get("*/api/documents", () => {
        return apiResponse([
          {
            id: 1,
            filename: "doc.pdf",
            status: "indexed",
            created_at: "2026-03-19T08:00:00Z",
          },
        ]);
      }),
    );

    const result = await getDocuments();

    expect(result).toHaveLength(1);
  });

  it("deletes a document", async () => {
    overrideHandler(
      http.delete("*/api/documents/1", () => {
        return apiResponse({ deleted: true });
      }),
    );

    await deleteDocument(1);
  });

  it("gets document versions", async () => {
    overrideHandler(
      http.get("*/api/documents/1/revisions", () => {
        return apiResponse([
          {
            id: 1,
            document_id: 1,
            revision_no: 1,
            ingest_status: "indexed",
            created_at: "2026-03-19T08:00:00Z",
          },
        ]);
      }),
    );

    const result = await getDocumentVersions(1);

    expect(result).toHaveLength(1);
  });

  it("gets document upload readiness", async () => {
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () => {
        return apiResponse({
          can_upload: true,
          blocking_reason: null,
          image_fallback: null,
        });
      }),
    );

    const result = await getDocumentUploadReadiness();

    expect(result.can_upload).toBe(true);
  });

  it("gets document list summary", async () => {
    overrideHandler(
      http.get("*/api/documents/summary", () => {
        return apiResponse({
          pending_count: 2,
        });
      }),
    );

    const result = await getDocumentListSummary();

    expect(result.pending_count).toBe(2);
  });

  it("uploads a document using XMLHttpRequest with bearer token", async () => {
    setAccessToken("upload-token");

    const originalXMLHttpRequest = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

    const uploadPromise = uploadDocument(
      new File(["content"], "test.pdf", { type: "application/pdf" }),
    );

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    const xhr = MockXMLHttpRequest.instances[0]!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe(buildApiUrl("/api/documents/upload"));
    expect(xhr.headers["Authorization"]).toBe("Bearer upload-token");

    xhr.simulateProgress(50, 100);
    xhr.simulateProgress(100, 100);
    xhr.simulateResponse(
      200,
      JSON.stringify({
        success: true,
        data: {
          deduplicated: false,
          document: {
            id: 1,
            title: "test.pdf",
            ingest_status: "pending",
            created_at: "2026-03-19T08:00:00Z",
          },
          revision: {
            id: 1,
            document_id: 1,
            revision_no: 1,
            source_filename: "test.pdf",
            ingest_status: "pending",
            created_at: "2026-03-19T08:00:00Z",
          },
          latest_revision: {
            id: 1,
            document_id: 1,
            revision_no: 1,
            source_filename: "test.pdf",
            ingest_status: "pending",
            created_at: "2026-03-19T08:00:00Z",
          },
        },
        error: null,
      }),
    );

    await expect(uploadPromise).resolves.toMatchObject({
      id: 1,
      name: "test.pdf",
    });

    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  });

  it("rejects when upload fails", async () => {
    setAccessToken("upload-token");

    const originalXMLHttpRequest = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

    const uploadPromise = uploadDocument(
      new File(["content"], "test.pdf", { type: "application/pdf" }),
    );

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    const xhr = MockXMLHttpRequest.instances[0]!;
    xhr.simulateError();

    await expect(uploadPromise).rejects.toThrow();

    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  });
});
