import { http } from "msw";
import { apiResponse } from "./utils";

type KnowledgeHandlersOptions = {
  documents?: Array<{
    id: number;
    filename: string;
    status: string;
    created_at: string;
  }>;
};

export function createKnowledgeHandlers(options: KnowledgeHandlersOptions = {}) {
  const { documents = [] } = options;

  return [
    http.get("*/api/documents", () => {
      return apiResponse(documents);
    }),

    http.post("*/api/documents/upload", async ({ request: _request }) => {
      return apiResponse({
        deduplicated: false,
        document: {
          id: documents.length + 1,
          filename: "test-document.pdf",
          status: "pending",
          created_at: new Date().toISOString(),
        },
      });
    }),

    http.get("*/api/documents/upload-readiness", () => {
      return apiResponse({
        can_upload: true,
        blocking_reason: null,
        image_fallback: null,
      });
    }),

    http.get("*/api/documents/summary", () => {
      return apiResponse({
        pending_count: 2,
        indexed_count: 8,
        total_count: 10,
      });
    }),

    http.get("*/api/documents/:documentId", ({ params }) => {
      const documentId = Number(params.documentId);
      const document = documents.find((d) => d.id === documentId);

      if (!document) {
        return apiResponse(null, { status: 404 });
      }

      return apiResponse(document);
    }),

    http.delete("*/api/documents/:documentId", ({ params: _params }) => {
      return apiResponse({ deleted: true });
    }),

    http.get("*/api/documents/:documentId/preview", ({ params }) => {
      return apiResponse({
        id: Number(params.documentId),
        content: "This is a preview of the document content.",
        type: "text",
      });
    }),

    http.get("*/api/documents/:documentId/revisions", ({ params: _params }) => {
      return apiResponse([]);
    }),
  ];
}
