import { describe, expect, it } from "vite-plus/test";

import {
  formatKnowledgeDocumentDateTime,
  getKnowledgeDocumentCategoryLabel,
  getKnowledgeDocumentStatusMeta,
} from "./resource-document-helpers";

const TRANSLATIONS = {
  previewTypeDocx: "DOCX",
  previewTypeDocument: "文档",
  previewTypeImage: "图片",
  previewTypeMarkdown: "Markdown",
  previewTypePdf: "PDF",
  previewTypeTxt: "TXT",
  statusFailed: "失败",
  statusIndexed: "已索引",
  statusProcessing: "处理中",
  statusUploaded: "已上传",
} as const;

function mockT(key: string) {
  return TRANSLATIONS[key as keyof typeof TRANSLATIONS] ?? key;
}

describe("resource-document-helpers", () => {
  it("maps file types into resource-facing labels", () => {
    expect(getKnowledgeDocumentCategoryLabel("pdf", mockT)).toBe("PDF");
    expect(getKnowledgeDocumentCategoryLabel("png", mockT)).toBe("图片");
    expect(getKnowledgeDocumentCategoryLabel("md", mockT)).toBe("Markdown");
    expect(getKnowledgeDocumentCategoryLabel("docx", mockT)).toBe("DOCX");
    expect(getKnowledgeDocumentCategoryLabel("bin", mockT)).toBe("文档");
  });

  it("returns status copy and badge variant", () => {
    expect(getKnowledgeDocumentStatusMeta("failed", mockT)).toEqual({
      label: "失败",
      variant: "destructive",
    });
    expect(getKnowledgeDocumentStatusMeta("indexed", mockT)).toEqual({
      label: "已索引",
      variant: "secondary",
    });
    expect(getKnowledgeDocumentStatusMeta("processing", mockT)).toEqual({
      label: "处理中",
      variant: "outline",
    });
  });

  it("formats timestamps with locale fallback", () => {
    expect(formatKnowledgeDocumentDateTime("2026-03-19T09:00:00Z", "zh-CN")).toContain("2026");
    expect(formatKnowledgeDocumentDateTime("not-a-date", "zh-CN")).toBe("not-a-date");
  });
});
