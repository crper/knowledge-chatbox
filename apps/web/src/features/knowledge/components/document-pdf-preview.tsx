/**
 * @file PDF 内嵌预览组件模块。
 */

import { PDFViewer } from "@embedpdf/react-pdf-viewer";

import { getDocumentFileUrl } from "@/lib/api/document-file-url";
import { cn } from "@/lib/utils";
import type { KnowledgeDocument } from "../api/documents";

type DocumentPdfPreviewProps = {
  compact?: boolean;
  document: KnowledgeDocument;
};

const DEFAULT_DISABLED_CATEGORIES = [
  "annotation",
  "document",
  "history",
  "redaction",
  "selection",
  "tools",
];

const COMPACT_DISABLED_CATEGORIES = [...DEFAULT_DISABLED_CATEGORIES, "panel"];

/**
 * 渲染 PDF 内嵌预览。
 */
export function DocumentPdfPreview({ compact = false, document }: DocumentPdfPreviewProps) {
  const fileUrl = getDocumentFileUrl(document.id);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.5rem] border border-border/60 bg-background",
        compact ? "h-[min(68vh,40rem)] min-h-[26rem]" : "h-[min(76vh,56rem)] min-h-[34rem]",
      )}
    >
      <PDFViewer
        className="h-full w-full"
        config={{
          disabledCategories: compact ? COMPACT_DISABLED_CATEGORIES : DEFAULT_DISABLED_CATEGORIES,
          documentManager: {
            initialDocuments: [
              {
                documentId: `knowledge-document-${document.id}`,
                name: document.name,
                requestOptions: {
                  credentials: "include",
                },
                url: fileUrl,
              },
            ],
          },
          tabBar: "never",
          theme: {
            preference: "system",
          },
        }}
        key={`${document.id}-${document.updated_at}`}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
