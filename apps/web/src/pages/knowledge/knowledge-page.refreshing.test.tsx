import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vite-plus/test";

import { QueryProvider } from "@/providers/query-provider";
import { KnowledgePage } from "./knowledge-page";

vi.mock("@/features/knowledge/hooks/use-knowledge-workspace", () => ({
  useKnowledgeWorkspace: () => ({
    canManageDocuments: true,
    canManageProviderSettings: true,
    cancelUpload: vi.fn(),
    closeVersionDrawer: vi.fn(),
    deleteDocument: vi.fn(),
    documents: [
      {
        created_at: "2026-04-05T00:00:00Z",
        document_id: 20,
        file_type: "md",
        id: 2,
        is_latest: true,
        name: "spec.md",
        status: "indexed",
        updated_at: "2026-04-05T00:00:00Z",
        version: 2,
      },
    ],
    documentsFetching: true,
    documentsRefreshing: true,
    documentsUpdatedAt: Date.now(),
    enqueueUploads: vi.fn(),
    localUploadingCount: 0,
    processingCount: 0,
    rejectFiles: vi.fn(),
    removeUpload: vi.fn(),
    reindexDocument: vi.fn(),
    retryUpload: vi.fn(),
    showVersions: vi.fn(),
    uploadItems: [],
    uploadReadiness: {
      blocking_reason: null,
      can_upload: true,
      image_fallback: false,
    },
    uploadReadinessPending: false,
    versionDrawerOpen: false,
    versions: [],
  }),
}));

describe("KnowledgePage refreshing hint", () => {
  it("does not show the filter-refreshing hint for background list refreshes alone", async () => {
    render(
      <MemoryRouter>
        <QueryProvider>
          <KnowledgePage />
        </QueryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("spec.md")).toBeInTheDocument();
    expect(screen.queryByText("正在更新筛选结果...")).not.toBeInTheDocument();
  });
});
