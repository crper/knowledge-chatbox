import { render, screen } from "@testing-library/react";

import { i18n } from "@/i18n";
import { GraphPage } from "./graph-page";

describe("GraphPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("renders the placeholder graph workspace state", async () => {
    render(<GraphPage />);

    expect(await screen.findByRole("heading", { name: "知识图谱" })).toBeInTheDocument();
    expect(screen.getByText("图谱工作区已预留")).toBeInTheDocument();
    expect(screen.getByText(/这一阶段先在顶层工作台里预留图谱入口/)).toBeInTheDocument();
  });
});
