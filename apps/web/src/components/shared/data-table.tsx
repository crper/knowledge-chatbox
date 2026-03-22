/**
 * @file 数据表格共享组件模块。
 */

import { forwardRef, useMemo, useState, type ComponentProps } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row, RowData, SortingState, TableOptions } from "@tanstack/react-table";
import { TableVirtuoso, type TableComponents } from "react-virtuoso";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<TData, unknown>[];
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

const VirtualTableScroller = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      {...props}
      className={cn("relative w-full overflow-auto", className)}
      data-testid="data-table-virtual-scroll"
      ref={ref}
    />
  ),
);

VirtualTableScroller.displayName = "VirtualTableScroller";

function VirtualTable({ children, style }: ComponentProps<"table">) {
  return (
    <table
      className="w-full caption-bottom text-sm"
      data-slot="table"
      style={{ ...style, borderCollapse: "separate", borderSpacing: 0, width: "100%" }}
    >
      {children}
    </table>
  );
}

const VirtualTableHead = forwardRef<HTMLTableSectionElement, ComponentProps<"thead">>(
  ({ className, ...props }, ref) => (
    <thead
      className={cn("[&_tr]:border-b", className)}
      data-slot="table-header"
      ref={ref}
      {...props}
    />
  ),
);

VirtualTableHead.displayName = "VirtualTableHead";

const VirtualTableBody = forwardRef<HTMLTableSectionElement, ComponentProps<"tbody">>(
  ({ className, ...props }, ref) => (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      data-slot="table-body"
      ref={ref}
      {...props}
    />
  ),
);

VirtualTableBody.displayName = "VirtualTableBody";

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

/**
 * 渲染数据表格。
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage,
  getRowId,
  onRowClick,
  selectedRowId,
  virtualized = false,
}: DataTableProps<TData>) {
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

  const renderHeaderCell = (header: (typeof headerGroups)[number]["headers"][number]) => {
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
  };

  const virtuosoComponents = useMemo<TableComponents<Row<TData>, unknown> | undefined>(() => {
    if (!shouldVirtualize) {
      return undefined;
    }

    return {
      Scroller: VirtualTableScroller,
      Table: VirtualTable,
      TableBody: VirtualTableBody,
      TableHead: VirtualTableHead,
      TableRow: ({ children, item, ...props }) => (
        <TableRow
          {...props}
          className={onRowClick ? "cursor-pointer" : undefined}
          data-state={selectedRowId === item.id ? "selected" : undefined}
          onClick={
            onRowClick
              ? (event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("button,a,input,textarea,select,[role='button']")) {
                    return;
                  }
                  onRowClick(item.original);
                }
              : undefined
          }
        >
          {children}
        </TableRow>
      ),
    };
  }, [onRowClick, selectedRowId, shouldVirtualize]);

  return (
    <div className="surface-panel-subtle overflow-hidden rounded-[1.25rem]">
      {shouldVirtualize ? (
        <TableVirtuoso
          components={virtuosoComponents!}
          computeItemKey={(_, row) => row.id}
          data={tableRows}
          defaultItemHeight={VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT}
          fixedHeaderContent={() =>
            headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => renderHeaderCell(header))}
              </TableRow>
            ))
          }
          itemContent={(_, row) =>
            row
              .getVisibleCells()
              .map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))
          }
          style={{ height: `${virtualTableHeight}px` }}
        />
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
                    onClick={
                      onRowClick
                        ? (event) => {
                            const target = event.target as HTMLElement;
                            if (target.closest("button,a,input,textarea,select,[role='button']")) {
                              return;
                            }
                            onRowClick(row.original);
                          }
                        : undefined
                    }
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
