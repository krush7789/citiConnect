import React from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const AdminDataTable = ({
  columns,
  data,
  getRowId,
  className,
  headerClassName,
  rowClassName,
  cellClassName,
}) => {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <Table className="w-full text-sm">
        <TableHeader className={cn("bg-muted/50 [&_th]:font-semibold [&_th]:text-foreground", headerClassName)}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="p-3 h-auto">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={cn("border-t align-top", rowClassName)}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={cn("p-3", cellClassName)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AdminDataTable;
