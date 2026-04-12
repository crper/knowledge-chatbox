import { render, screen } from "@testing-library/react";

import type { ChatSourceItem } from "@/features/chat/api/chat";

import { SourceList } from "./source-list";

describe("SourceList", () => {
  it("keeps citations compact behind a mini reference trigger", () => {
    render(
      <SourceList
        sources={[
          {
            chunk_id: "doc-1:0",
            document_name: "产品手册.pdf",
            page_number: 3,
            snippet: "示例片段",
          },
        ]}
      />,
    );

    expect(screen.queryByText("产品手册.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("示例片段")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看引用 1" })).toBeInTheDocument();
  });

  it("does not emit key warnings for fallback sources without chunk ids", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SourceList
        sources={
          [
            {
              document_id: 1,
              document_name: "alpha.md",
              page_number: 1,
              snippet: "alpha snippet",
            },
            {
              document_id: 2,
              document_name: "beta.md",
              page_number: 2,
              snippet: "beta snippet",
            },
          ] as never
        }
      />,
    );

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("renders typed ChatSourceItem with all fields from ChatSourceRead schema", () => {
    const typedSources: ChatSourceItem[] = [
      {
        chunk_id: "chunk-001",
        document_id: 42,
        document_revision_id: 100,
        document_name: "API规范文档.pdf",
        page_number: 15,
        score: 0.92,
        section_title: "认证与授权",
        snippet: "使用 JWT 令牌进行身份验证...",
      },
      {
        chunk_id: "chunk-002",
        document_id: 43,
        document_revision_id: undefined,
        document_name: "数据库设计.md",
        page_number: undefined,
        score: 0.85,
        section_title: undefined,
        snippet: "用户表包含以下字段...",
      },
    ];

    render(<SourceList sources={typedSources} />);

    expect(screen.getByRole("button", { name: "查看引用 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看引用 2" })).toBeInTheDocument();
  });
});
