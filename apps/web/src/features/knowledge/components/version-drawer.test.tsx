import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { http } from "msw";
import { I18nextProvider } from "react-i18next";

import { i18n } from "@/i18n";
import { QueryProvider } from "@/providers/query-provider";
import { apiResponse, createTestServer, overrideHandler } from "@/test/msw";
import { VersionDrawer } from "./version-drawer";

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

function renderVersionDrawer(documentId: number | null) {
  const onClose = vi.fn();

  render(
    <QueryProvider>
      <I18nextProvider i18n={i18n}>
        <VersionDrawer documentId={documentId} onClose={onClose} open />
      </I18nextProvider>
    </QueryProvider>,
  );

  return { onClose };
}

describe("VersionDrawer", () => {
  beforeEach(() => {
    createTestServer();
    overrideHandler(
      http.get("*/api/documents/:documentId/revisions", ({ params }) =>
        apiResponse([
          buildRevision({
            document_id: Number(params.documentId),
            id: 4,
            revision_no: 1,
            source_filename: "guide.md",
          }),
          buildRevision({
            document_id: Number(params.documentId),
            id: 6,
            revision_no: 3,
            source_filename: "guide.md",
          }),
        ]),
      ),
    );
  });

  it("fetches and renders versions from Query based on the active document id", async () => {
    renderVersionDrawer(40);

    expect(await screen.findByRole("dialog", { name: "版本历史" })).toBeInTheDocument();
    expect(await screen.findByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });
});
