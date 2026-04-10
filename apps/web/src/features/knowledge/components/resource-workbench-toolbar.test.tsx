import * as React from "react";
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const labels: Record<string, string> = {
        clearFiltersAction: "清空筛选",
        filterStatusSectionTitle: "状态",
        filterTypeSectionTitle: "类型",
        mobileFilterAction: "筛选",
        mobileFilterActionWithCount: `筛选（${options?.count ?? 0}）`,
        mobileFilterDescription: "按类型和状态筛选资源。",
        mobileFilterTitle: "资源筛选",
        searchInputLabel: "搜索资源",
        searchInputPlaceholder: "按名称、类型或状态筛选",
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, render }: { children?: ReactNode; render: React.ReactElement }) =>
    React.cloneElement(render, undefined, children),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetFooter: ({
    children,
    className,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children, render }: { children?: ReactNode; render: React.ReactElement }) =>
    React.cloneElement(render, undefined, children),
}));

import { ResourceWorkbenchToolbar } from "./resource-workbench-toolbar";

function renderToolbar(isMobile: boolean) {
  const clearFilters = vi.fn();

  render(
    <ResourceWorkbenchToolbar
      activeFilterBadges={["PDF"]}
      activeFilterCount={1}
      clearFilters={clearFilters}
      isMobile={isMobile}
      renderUploadAction={() => <button type="button">上传资源</button>}
      searchValue=""
      setSearchValue={vi.fn()}
      statusFilterButtons={<button type="button">处理中</button>}
      typeFilterButtons={<button type="button">PDF</button>}
    />,
  );

  return { clearFilters };
}

describe("ResourceWorkbenchToolbar", () => {
  it("renders the desktop popover filter content", () => {
    renderToolbar(false);

    expect(screen.getByText("资源筛选")).toBeInTheDocument();
    expect(screen.getByText("按类型和状态筛选资源。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "处理中" })).toBeInTheDocument();
  });

  it("renders the mobile sheet filter content and clears filters", () => {
    const { clearFilters } = renderToolbar(true);

    expect(screen.getByText("资源筛选")).toBeInTheDocument();
    expect(screen.getByText("按类型和状态筛选资源。")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-mobile-filter-body")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("knowledge-mobile-filter-body")).toHaveClass("min-h-0");
    expect(screen.getByTestId("knowledge-mobile-filter-footer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "清空筛选" })[0]!);

    expect(clearFilters).toHaveBeenCalledTimes(1);
  });
});
