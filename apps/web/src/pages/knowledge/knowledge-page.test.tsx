import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { QueryProvider } from "@/providers/query-provider";
import { createTestServer, overrideHandler, apiResponse } from "@/test/msw";
import { TestRouter } from "@/test/test-router";
import { http, HttpResponse } from "msw";
import { mockDesktopViewport, mockMobileViewport } from "@/test/viewport";
import { KnowledgePage } from "./knowledge-page";

const sonnerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: sonnerMocks,
}));

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  method = "";
  aborted = false;
  onabort: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onerror: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  onload: ((event: ProgressEvent<EventTarget>) => void) | null = null;
  responseText = "";
  status = 0;
  statusText = "";
  upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
  url = "";
  withCredentials = false;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send() {}

  abort() {
    this.aborted = true;
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
}

function renderKnowledgePage({
  applyDefaultUploadReadiness = true,
  initialEntry = "/knowledge",
}: {
  applyDefaultUploadReadiness?: boolean;
  initialEntry?: string;
} = {}) {
  if (applyDefaultUploadReadiness) {
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () =>
        apiResponse({
          can_upload: true,
          blocking_reason: null,
          image_fallback: false,
        }),
      ),
    );
  }

  return render(
    <TestRouter initialEntry={initialEntry} path="/knowledge">
      <QueryProvider>
        <KnowledgePage />
      </QueryProvider>
    </TestRouter>,
  );
}

function buildRevision(overrides: Record<string, unknown> = {}) {
  return {
    chunk_count: 3,
    created_at: "2026-03-19T08:00:00Z",
    created_by_user_id: 1,
    document_id: 20,
    error_message: null,
    file_size: 12,
    file_type: "md",
    id: 2,
    indexed_at: "2026-03-19T09:00:00Z",
    ingest_status: "indexed",
    mime_type: "text/markdown",
    normalized_path: "/normalized/spec.md",
    revision_no: 2,
    source_filename: "spec.md",
    source_path: "/uploads/spec.md",
    supersedes_revision_id: null,
    updated_at: "2026-03-19T09:00:00Z",
    updated_by_user_id: 1,
    ...overrides,
  };
}

function buildDocumentSummary(overrides: Record<string, unknown> = {}) {
  const documentId = typeof overrides.id === "number" ? overrides.id : 20;
  const title = typeof overrides.title === "string" ? overrides.title : "spec.md";
  const revisionId = typeof overrides.revision_id === "number" ? overrides.revision_id : 2;
  const revisionNo = typeof overrides.version === "number" ? overrides.version : 2;
  const ingestStatus =
    typeof overrides.status === "string" ? overrides.status : buildRevision().ingest_status;
  const fileType = typeof overrides.file_type === "string" ? overrides.file_type : "md";
  const latestRevision =
    overrides.latest_revision === null
      ? null
      : buildRevision({
          document_id: documentId,
          file_type: fileType,
          id: revisionId,
          ingest_status: ingestStatus,
          revision_no: revisionNo,
          source_filename: title,
        });

  return {
    created_at: "2026-03-19T08:00:00Z",
    created_by_user_id: 1,
    id: documentId,
    latest_revision: latestRevision,
    logical_name: title,
    space_id: 1,
    status: "active",
    title,
    updated_at: "2026-03-19T09:00:00Z",
    updated_by_user_id: 1,
    ...overrides,
  };
}

function buildUploadPayload(overrides: Record<string, unknown> = {}) {
  const documentId = typeof overrides.document_id === "number" ? overrides.document_id : 20;
  const revisionId = typeof overrides.id === "number" ? overrides.id : 2;
  const title = typeof overrides.name === "string" ? overrides.name : "spec.md";
  const fileType = typeof overrides.file_type === "string" ? overrides.file_type : "md";
  const revisionNo = typeof overrides.version === "number" ? overrides.version : 1;
  const ingestStatus = typeof overrides.status === "string" ? overrides.status : "indexed";

  const revision = buildRevision({
    document_id: documentId,
    file_type: fileType,
    id: revisionId,
    ingest_status: ingestStatus,
    revision_no: revisionNo,
    source_filename: title,
  });
  const document = buildDocumentSummary({
    id: documentId,
    latest_revision: revision,
    revision_id: revisionId,
    title,
    version: revisionNo,
  });

  return {
    deduplicated: Boolean(overrides.deduplicated),
    document,
    latest_revision: revision,
    revision,
  };
}

describe("KnowledgePage", () => {
  beforeEach(() => {
    MockXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    sonnerMocks.error.mockReset();
    sonnerMocks.success.mockReset();
    mockDesktopViewport();
    createTestServer();
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () =>
        apiResponse({
          can_upload: true,
          blocking_reason: null,
          image_fallback: false,
        }),
      ),
    );
    overrideHandler(http.get("*/api/documents", () => apiResponse([])));
  });

  it("renders row-card actions without the old inline delete buttons", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]),
      ),
    );
    overrideHandler(
      http.get("*/api/documents/20/revisions", () =>
        apiResponse([
          buildRevision({ document_id: 20, id: 1, revision_no: 1, source_filename: "spec.md" }),
          buildRevision({ document_id: 20, id: 2, revision_no: 2, source_filename: "spec.md" }),
        ]),
      ),
    );
    overrideHandler(
      http.get("*/api/documents/40/revisions", () =>
        apiResponse([
          buildRevision({
            document_id: 40,
            id: 4,
            revision_no: 1,
            source_filename: "guide.pdf",
            file_type: "pdf",
          }),
        ]),
      ),
    );

    renderKnowledgePage();

    expect(await screen.findByRole("heading", { name: "资源" })).toBeInTheDocument();
    expect(screen.getByText("资源工作区")).toBeInTheDocument();
    expect(await screen.findByLabelText("上传资源")).toBeInTheDocument();
    expect(screen.queryByText("拖拽资源到这里，或选择文件")).not.toBeInTheDocument();
    expect((await screen.findAllByText("已索引")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("处理中").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /预览 / })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "查看版本" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /更多操作 / })).toHaveLength(2);
  });

  it("renders top summary cards for resource counts", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("2 项资源")).toBeInTheDocument();
    expect(screen.getAllByText("1 项处理中").length).toBeGreaterThan(0);
    expect(screen.getByText("1 项已索引")).toBeInTheDocument();
    expect(screen.getByText("资源工作区")).toBeInTheDocument();
  });

  it("uses compact inline summary badges on mobile instead of the desktop metric cards", async () => {
    mockMobileViewport();
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("资源列表")).toBeInTheDocument();
    expect(screen.queryByText("资源总数")).not.toBeInTheDocument();
    expect(screen.queryByText("处理中资源")).not.toBeInTheDocument();
    expect(screen.queryByText("已索引资源")).not.toBeInTheDocument();
    expect(screen.getByText("2 项资源")).toBeInTheDocument();
    expect(screen.getAllByText("1 项处理中").length).toBeGreaterThan(0);
    expect(screen.getByText("1 项已索引")).toBeInTheDocument();
  });

  it("blocks uploads when indexing prerequisites are not ready", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () =>
        apiResponse({
          blocking_reason: "embedding_not_configured",
          can_upload: false,
          image_fallback: false,
        }),
      ),
    );
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage({ applyDefaultUploadReadiness: false });

    expect(await screen.findByRole("button", { name: "上传资源" })).toBeDisabled();
  });

  it("shows a neutral loading notice while upload readiness is still being checked", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(http.get("*/api/documents/upload-readiness", () => new Promise(() => {})));
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage({ applyDefaultUploadReadiness: false });

    expect(await screen.findByRole("button", { name: "上传资源" })).toBeDisabled();
    expect(screen.queryByText("上传前需要先配置检索 Provider。")).not.toBeInTheDocument();
  });

  it("shows an image fallback warning without blocking uploads", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () =>
        apiResponse({
          blocking_reason: null,
          can_upload: true,
          image_fallback: true,
        }),
      ),
    );
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage({ applyDefaultUploadReadiness: false });

    expect(await screen.findByRole("button", { name: "上传资源" })).toBeEnabled();
  });

  it("keeps the preview drawer closed until the user explicitly opens it", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("资源工作区")).toBeInTheDocument();
    expect(screen.queryByText("资源预览")).not.toBeInTheDocument();
  });

  it("does not send the delete request immediately when the delete action is clicked", async () => {
    let deleteCalled = false;
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));
    overrideHandler(
      http.delete("*/api/documents/:documentId", () => {
        deleteCalled = true;
        return apiResponse({ status: "ok" });
      }),
    );

    renderKnowledgePage();

    fireEvent.click(await screen.findByRole("button", { name: "更多操作 spec.md" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(deleteCalled).toBe(false);
  });

  it("uploads a document and refreshes the list", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    const input = (
      await screen.findAllByLabelText("上传资源", {
        selector: 'input[type="file"]',
      })
    )[0]!;
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "upload.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    await act(async () => {
      MockXMLHttpRequest.instances[0]!.respond(
        201,
        JSON.stringify({
          success: true,
          data: buildUploadPayload({
            document_id: 12,
            id: 3,
            name: "upload.txt",
            version: 1,
            status: "indexed",
            file_type: "txt",
          }),
          error: null,
        }),
      );
    });

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
      expect(MockXMLHttpRequest.instances[0]!.url.endsWith("/api/documents/upload")).toBe(true);
    });
  });

  it("shows a pending upload state while the request is in flight", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    const input = (
      await screen.findAllByLabelText("上传资源", {
        selector: 'input[type="file"]',
      })
    )[0]!;
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "draft.md", { type: "text/markdown" })],
      },
    });

    expect(await screen.findByText("上传队列")).toBeInTheDocument();
    expect(screen.getByText("上传中 1 项")).toBeInTheDocument();
    expect(screen.getByText("draft.md")).toBeInTheDocument();
    expect(screen.getByText("上传中 0%")).toBeInTheDocument();

    await act(async () => {
      MockXMLHttpRequest.instances[0]!.emitProgress(5, 10);
    });
    expect(await screen.findByText("上传中 50%")).toBeInTheDocument();

    await act(async () => {
      MockXMLHttpRequest.instances[0]!.emitProgress(10, 10);
    });
    expect(await screen.findByText("已上传，处理中")).toBeInTheDocument();
    expect(screen.queryByText("上传中 100%")).not.toBeInTheDocument();

    await act(async () => {
      MockXMLHttpRequest.instances[0]!.respond(
        201,
        JSON.stringify({
          success: true,
          data: buildUploadPayload({
            document_id: 18,
            id: 9,
            name: "draft.md",
            version: 1,
            status: "uploaded",
          }),
          error: null,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("draft.md")).not.toBeInTheDocument();
      expect(screen.queryByText("上传队列")).not.toBeInTheDocument();
    });
  });

  it("cancels an in-flight upload from the queue without leaving a placeholder behind", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    const input = (
      await screen.findAllByLabelText("上传资源", {
        selector: 'input[type="file"]',
      })
    )[0]!;
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "draft.md", { type: "text/markdown" })],
      },
    });

    expect(await screen.findByText("上传队列")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消上传 draft.md" }));

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances[0]!.aborted).toBe(true);
      expect(screen.queryByText("draft.md")).not.toBeInTheDocument();
      expect(screen.queryByText("上传队列")).not.toBeInTheDocument();
    });
  });

  it("removes duplicate uploads from the queue and shows a skipped toast", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    const input = (
      await screen.findAllByLabelText("上传资源", {
        selector: 'input[type="file"]',
      })
    )[0]!;
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "draft.md", { type: "text/markdown" })],
      },
    });

    expect(await screen.findByText("上传队列")).toBeInTheDocument();
    expect(screen.getByText("上传中 1 项")).toBeInTheDocument();

    await act(async () => {
      MockXMLHttpRequest.instances[0]!.respond(
        200,
        JSON.stringify({
          success: true,
          data: buildUploadPayload({
            deduplicated: true,
            document_id: 18,
            id: 9,
            name: "draft.md",
            version: 1,
            status: "indexed",
          }),
          error: null,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("draft.md")).not.toBeInTheDocument();
      expect(screen.queryByText("上传队列")).not.toBeInTheDocument();
    });
    expect(sonnerMocks.success).toHaveBeenCalledWith("资源 draft.md 无变化，已跳过上传");
  });

  it("ignores repeated retry clicks for the same failed upload", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    const input = (
      await screen.findAllByLabelText("上传资源", {
        selector: 'input[type="file"]',
      })
    )[0]!;
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "draft.md", { type: "text/markdown" })],
      },
    });

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });
    await act(async () => {
      MockXMLHttpRequest.instances[0]!.respond(
        500,
        JSON.stringify({
          success: false,
          error: {
            message: "网络中断",
          },
        }),
        "Internal Server Error",
      );
    });

    const retryButton = await screen.findByRole("button", { name: "重试上传" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(2);
    });

    await act(async () => {
      MockXMLHttpRequest.instances[1]!.respond(
        201,
        JSON.stringify({
          success: true,
          data: buildUploadPayload({
            document_id: 18,
            id: 9,
            name: "draft.md",
            version: 1,
            status: "indexed",
          }),
          error: null,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("draft.md")).not.toBeInTheDocument();
      expect(screen.queryByText("上传队列")).not.toBeInTheDocument();
    });
    expect(MockXMLHttpRequest.instances).toHaveLength(2);
  });

  it("opens the preview drawer when the preview action is clicked", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(
      http.get("*/api/documents/:documentId/revisions", () =>
        apiResponse([
          buildRevision({ document_id: 20, id: 1, revision_no: 1, source_filename: "spec.md" }),
          buildRevision({ document_id: 20, id: 2, revision_no: 2, source_filename: "spec.md" }),
        ]),
      ),
    );
    overrideHandler(
      http.get(
        "*/api/documents/revisions/:revisionId/file",
        () =>
          new HttpResponse("# 标题\n\n正文", {
            headers: { "Content-Type": "text/markdown; charset=utf-8" },
          }),
      ),
    );

    renderKnowledgePage();

    fireEvent.click(await screen.findByRole("button", { name: "预览 spec.md" }));

    expect(await screen.findByText("资源预览")).toBeInTheDocument();
    expect(screen.getAllByText("spec.md").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "打开原文件" })).toBeInTheDocument();
  });

  it("selects a resource row and shows the summary band without opening preview", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    fireEvent.click(await screen.findByRole("button", { name: "guide.pdf" }));

    expect(await screen.findByText("当前资源")).toBeInTheDocument();
    expect(screen.getAllByText("guide.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.queryByText("资源预览")).not.toBeInTheDocument();
  });

  it("opens preview directly when a resource row is selected on mobile", async () => {
    mockMobileViewport();
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    fireEvent.click(await screen.findByRole("button", { name: "guide.pdf" }));

    expect(await screen.findByText("资源预览")).toBeInTheDocument();
    expect(screen.getAllByText("guide.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("当前资源")).not.toBeInTheDocument();
  });

  it("requests server-filtered resources and clears the selected summary band when the chosen resource disappears", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get("query");
        if (query === "guide") {
          return apiResponse([
            buildDocumentSummary({
              id: 40,
              revision_id: 4,
              title: "guide.pdf",
              version: 1,
              status: "processing",
              file_type: "pdf",
            }),
          ]);
        }
        return apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]);
      }),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    await screen.findAllByRole("button", { name: "查看版本" });
    fireEvent.click(screen.getByRole("button", { name: "spec.md" }));
    expect(await screen.findByText("当前资源")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜索资源"), {
      target: { value: "guide" },
    });

    await waitFor(() => {
      expect(screen.queryByText("spec.md")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("guide.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("当前资源")).not.toBeInTheDocument();
  });

  it("syncs the search query into the URL and restores it from the route state", async () => {
    overrideHandler(
      http.get("*/api/documents", ({ request }) => {
        const query = new URL(request.url).searchParams.get("query");
        if (query === "guide") {
          return apiResponse([
            buildDocumentSummary({
              id: 40,
              revision_id: 4,
              title: "guide.pdf",
              version: 1,
              status: "processing",
              file_type: "pdf",
            }),
          ]);
        }

        return apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]);
      }),
    );

    renderKnowledgePage({ initialEntry: "/knowledge?query=guide" });

    expect(await screen.findByDisplayValue("guide")).toBeInTheDocument();
    expect((await screen.findAllByText("guide.pdf")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("搜索资源"), {
      target: { value: "" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("搜索资源")).toHaveValue("");
    });
  });

  it("moves type and status filters into a mobile sheet", async () => {
    mockMobileViewport();
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type");
        if (type === "pdf") {
          return apiResponse([
            buildDocumentSummary({
              id: 40,
              revision_id: 4,
              title: "guide.pdf",
              version: 1,
              status: "processing",
              file_type: "pdf",
            }),
          ]);
        }
        return apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]);
      }),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("资源工作区")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /^筛选/ }));

    expect(await screen.findByText("资源筛选")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => {
      expect(screen.queryByText("spec.md")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "清空筛选" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "清空筛选" })).not.toBeInTheDocument();
    });
  });

  it("writes mobile filter selections back into the URL search", async () => {
    mockMobileViewport();
    overrideHandler(
      http.get("*/api/documents", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("type") === "pdf") {
          return apiResponse([
            buildDocumentSummary({
              id: 40,
              revision_id: 4,
              title: "guide.pdf",
              version: 1,
              status: "processing",
              file_type: "pdf",
            }),
          ]);
        }

        return apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]);
      }),
    );

    renderKnowledgePage();

    expect(await screen.findByText("资源工作区")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^筛选/ }));
    fireEvent.click(await screen.findByRole("button", { name: "PDF" }));

    await waitFor(() => {
      expect(screen.queryByText("spec.md")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "清空筛选" })).not.toBeInTheDocument();
    });
  });

  it("keeps the resource list shell when a status filter yields no matches", async () => {
    mockMobileViewport();
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        if (status === "uploaded") {
          return apiResponse([]);
        }
        return apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
          buildDocumentSummary({
            id: 40,
            revision_id: 4,
            title: "guide.pdf",
            version: 1,
            status: "processing",
            file_type: "pdf",
          }),
        ]);
      }),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("资源工作区")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^筛选/ }));
    expect(await screen.findByText("资源筛选")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已上传" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(screen.getByText("暂无匹配资源")).toBeInTheDocument();
    });
    expect(screen.getByText("资源列表")).toBeInTheDocument();
    expect(
      screen.getByText("当前筛选条件下没有匹配资源，试试更换关键词、类型或状态。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "先上传第一份资源" })).not.toBeInTheDocument();
  });

  it("renders document management actions for non-admin users", async () => {
    createTestServer({
      user: { id: 1, username: "user", role: "user", status: "active", theme_preference: "system" },
      authenticated: true,
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          buildDocumentSummary({
            id: 20,
            revision_id: 2,
            title: "spec.md",
            version: 2,
            status: "indexed",
          }),
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByText("资源工作区")).toBeInTheDocument();
    expect(screen.getByLabelText("搜索资源")).toBeInTheDocument();
  });

  it("renders an onboarding empty state for admins when there are no resources", async () => {
    createTestServer({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      },
      authenticated: true,
    });
    overrideHandler(http.get("*/api/documents", () => apiResponse([])));
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByRole("heading", { name: "先上传第一份资源" })).toBeInTheDocument();
    expect(
      screen.getByText("上传后会自动进入处理队列，处理完成后就能在对话页里引用。"),
    ).toBeInTheDocument();
    expect(screen.getByText("第一次跑通路径")).toBeInTheDocument();
    expect(screen.getByText("1. 上传 1 份文档或图片")).toBeInTheDocument();
    expect(screen.getByText("2. 回到对话页提 1 个具体问题")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上传资源" }).length).toBeGreaterThan(0);
  });

  it("renders the onboarding empty state for non-admin users when there are no resources", async () => {
    createTestServer({
      user: { id: 1, username: "user", role: "user", status: "active", theme_preference: "system" },
      authenticated: true,
    });
    overrideHandler(http.get("*/api/documents", () => apiResponse([])));
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));

    renderKnowledgePage();

    expect(await screen.findByRole("heading", { name: "先上传第一份资源" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上传资源" }).length).toBeGreaterThan(0);
  });
});
