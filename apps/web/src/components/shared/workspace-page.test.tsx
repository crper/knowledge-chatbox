import { BoxesIcon, SparklesIcon } from "lucide-react";
import { render, screen } from "@testing-library/react";

import { WorkspaceMetricCard, WorkspacePage } from "./workspace-page";

describe("WorkspacePage", () => {
  it("renders shared page header, metrics, main content, and aside content", () => {
    render(
      <WorkspacePage
        actions={<button type="button">上传资源</button>}
        aside={<div>辅助内容</div>}
        badge="资源工作区"
        description="管理本地资源、版本和索引状态。"
        main={<div>主内容区域</div>}
        metrics={
          <>
            <WorkspaceMetricCard icon={BoxesIcon} label="资源总数" value="12 项资源" />
            <WorkspaceMetricCard
              detail="自动刷新"
              icon={SparklesIcon}
              label="处理中资源"
              value="2 项处理中"
            />
          </>
        }
        title="资源"
      />,
    );

    expect(screen.getByText("资源工作区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "资源" })).toBeInTheDocument();
    expect(screen.getByText("管理本地资源、版本和索引状态。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传资源" })).toBeInTheDocument();
    expect(screen.getByText("12 项资源")).toBeInTheDocument();
    expect(screen.getByText("资源总数")).toBeInTheDocument();
    expect(screen.getByText("自动刷新")).toBeInTheDocument();
    expect(screen.getByText("主内容区域")).toBeInTheDocument();
    expect(screen.getByText("辅助内容")).toBeInTheDocument();
  });
});
