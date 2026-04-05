import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./data-table";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn((options: { count?: number }) => {
    const count = options.count ?? 0;
    const visibleCount = Math.min(count, 4);

    return {
      getVirtualItems: () =>
        Array.from({ length: visibleCount }, (_, index) => ({
          index,
          key: index,
          size: 60,
          start: index * 60,
        })),
      getTotalSize: () => count * 60,
      measureElement: () => {},
    };
  }),
}));

type RowItem = {
  id: number;
  email: string;
  name: string;
};

const columns: ColumnDef<RowItem>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
];

const rows: RowItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  email: `user-${index + 1}@example.com`,
  name: `User ${index + 1}`,
}));

describe("DataTable", () => {
  it("keeps virtualized rows inside the same table as the header", () => {
    render(
      <DataTable
        columns={columns as unknown as ColumnDef<unknown, unknown>[]}
        data={rows as unknown as Record<string, unknown>[]}
        emptyMessage="empty"
        getRowId={(row: unknown) => String((row as RowItem).id)}
        virtualized={true}
      />,
    );

    const virtualScroller = screen.getByTestId("data-table-virtual-scroll");

    expect(within(virtualScroller).getAllByRole("table")).toHaveLength(1);
  });
});
