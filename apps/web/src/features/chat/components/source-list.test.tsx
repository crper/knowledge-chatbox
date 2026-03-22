import { render, screen } from "@testing-library/react";

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
});
