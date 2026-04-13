import { useCallback, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ColumnDef, RowData, SortingState, TableOptions } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableProps<TData extends RowData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage: string;
  getRowId?: TableOptions<TData>["getRowId"];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
  virtualized?: boolean;
};

const VIRTUAL_TABLE_MAX_HEIGHT = 640;
const VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT = 60;
const VIRTUAL_TABLE_HEADER_ROW_HEIGHT = 44;
const VIRTUALIZATION_ROW_THRESHOLD = 24;

function getAriaSortState(direction: false | "asc" | "desc") {
  if (direction === "asc") {
    return "ascending";
  }

  if (direction === "desc") {
    return "descending";
  }

  return "none";
}

function getSortIndicator(direction: false | "asc" | "desc") {
  if (direction === "asc") {
    return "↑";
  }

  if (direction === "desc") {
    return "↓";
  }

  return null;
}

export function DataTable<TData extends RowData, TValue = unknown>({
  columns,
  data,
  emptyMessage,
  getRowId,
  onRowClick,
  selectedRowId,
  virtualized = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  const leafColumnCount = table.getVisibleLeafColumns().length;
  const tableRows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const shouldVirtualize = virtualized && tableRows.length > VIRTUALIZATION_ROW_THRESHOLD;
  const virtualTableHeight = Math.min(
    tableRows.length * VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT +
      headerGroups.length * VIRTUAL_TABLE_HEADER_ROW_HEIGHT,
    VIRTUAL_TABLE_MAX_HEIGHT,
  );

  const renderHeaderCell = useMemo(
    () => (header: (typeof headerGroups)[number]["headers"][number]) => {
      const direction = header.column.getIsSorted();
      const canSort = header.column.getCanSort();

      return (
        <TableHead
          aria-sort={getAriaSortState(direction)}
          className="bg-background/96 backdrop-blur supports-[backdrop-filter]:bg-background/88"
          key={header.id}
        >
          {header.isPlaceholder ? null : canSort ? (
            <Button
              className="h-auto px-0 font-medium"
              onClick={header.column.getToggleSortingHandler()}
              type="button"
              variant="ghost"
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {getSortIndicator(direction) ? <span>{getSortIndicator(direction)}</span> : null}
            </Button>
          ) : (
            flexRender(header.column.columnDef.header, header.getContext())
          )}
        </TableHead>
      );
    },
    [],
  );

  const handleRowClick = useCallback(
    (row: (typeof tableRows)[number]) => (event: React.MouseEvent<HTMLElement>) => {
      if (!onRowClick) return;

      const target = event.target as HTMLElement;
      if (target.closest("button,a,input,textarea,select,[role='button']")) {
        return;
      }
      onRowClick(row.original);
    },
    [onRowClick],
  );

  const virtualParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => virtualParentRef.current,
    estimateSize: () => VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT,
    overscan: 5,
  });
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]!.start : 0;
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const paddingBottom =
    lastVirtualRow === undefined
      ? 0
      : rowVirtualizer.getTotalSize() - (lastVirtualRow.start + lastVirtualRow.size);

  return (
    <div className="surface-panel-subtle overflow-hidden rounded-xl">
      {shouldVirtualize ? (
        <div
          ref={virtualParentRef}
          className="relative w-full overflow-auto"
          data-testid="data-table-virtual-scroll"
          style={{ height: `${virtualTableHeight}px` }}
        >
          <table
            className="w-full caption-bottom text-sm"
            data-slot="table"
            style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}
          >
            <thead
              className="[&_tr]:border-b bg-background/96 backdrop-blur supports-[backdrop-filter]:bg-background/88"
              data-slot="table-header"
              style={{ position: "sticky", top: 0, zIndex: 1 }}
            >
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => renderHeaderCell(header))}
                </TableRow>
              ))}
            </thead>
            <tbody className="[&_tr:last-child]:border-0" data-slot="table-body">
              {paddingTop > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={leafColumnCount}
                    style={{ border: 0, height: `${paddingTop}px`, padding: 0 }}
                  />
                </tr>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const row = tableRows[virtualRow.index];
                if (!row) return null;

                return (
                  <TableRow
                    key={row.id}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    data-index={virtualRow.index}
                    data-state={selectedRowId === row.id ? "selected" : undefined}
                    onClick={handleRowClick(row)}
                    ref={rowVirtualizer.measureElement}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={leafColumnCount}
                    style={{ border: 0, height: `${paddingBottom}px`, padding: 0 }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div data-slot="table-container" className="relative w-full overflow-x-auto">
          <table data-slot="table" className="w-full caption-bottom text-sm">
            <TableHeader>
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => renderHeaderCell(header))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {tableRows.length === 0 ? (
                <TableRow>
                  <TableCell className="py-6" colSpan={leafColumnCount}>
                    <Empty className="bg-background/40">
                      <EmptyHeader>
                        <EmptyTitle>{emptyMessage}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                tableRows.map((row) => (
                  <TableRow
                    className={onRowClick ? "cursor-pointer" : undefined}
                    data-state={selectedRowId === row.id ? "selected" : undefined}
                    key={row.id}
                    onClick={handleRowClick(row)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}
