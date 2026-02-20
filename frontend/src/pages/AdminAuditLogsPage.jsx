import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/api/services";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PaginationControls from "@/components/PaginationControls";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const AUDIT_LOGS_PAGE_SIZE = 50;

const AdminAuditLogsPage = () => {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: "",
    entity_type: "",
    search: "",
  });

  const logsQuery = useQuery({
    queryKey: ["admin-audit-logs", page, filters.action, filters.entity_type],
    queryFn: () =>
      adminService.getAuditLogs({
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        page,
        page_size: AUDIT_LOGS_PAGE_SIZE,
      }),
  });

  const items = logsQuery.data?.items || [];
  const pageMeta = useMemo(
    () => ({
      page: logsQuery.data?.page || page,
      total_pages: logsQuery.data?.total_pages || 1,
      total: logsQuery.data?.total || 0,
    }),
    [logsQuery.data, page]
  );
  const loading = logsQuery.isLoading;
  const error = logsQuery.error?.normalized?.message || "";

  const filteredItems = items.filter((log) => {
    if (!filters.search) return true;
    const query = filters.search.toLowerCase();
    const diffText = JSON.stringify(log.diff || {}).toLowerCase();
    return (
      String(log.action || "").toLowerCase().includes(query) ||
      String(log.entity_type || "").toLowerCase().includes(query) ||
      String(log.entity_id || "").toLowerCase().includes(query) ||
      String(log.admin_user || "").toLowerCase().includes(query) ||
      diffText.includes(query)
    );
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "created_at",
        header: "Time",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
      {
        accessorKey: "admin_user",
        header: "Admin",
        cell: ({ row }) => row.original.admin_user || "--",
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => row.original.action || "--",
      },
      {
        id: "entity",
        header: "Entity",
        cell: ({ row }) => (
          <div>
            <p>{row.original.entity_type || "--"}</p>
            <p className="text-xs text-muted-foreground font-mono mt-1">{row.original.entity_id || "--"}</p>
          </div>
        ),
      },
      {
        accessorKey: "diff",
        header: "Diff",
        cell: ({ row }) => (
          <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-auto max-h-28">
            {JSON.stringify(row.original.diff || {}, null, 2)}
          </pre>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit Logs"
        description="Track admin actions with entity-level diff previews."
      />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Action</p>
              <Input
                value={filters.action}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, action: event.target.value.toUpperCase() }));
                }}
                placeholder="CREATE_LISTING"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entity type</p>
              <Input
                value={filters.entity_type}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, entity_type: event.target.value.toUpperCase() }));
                }}
                placeholder="LISTING / OFFER / OCCURRENCE"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Search</p>
              <Input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Find in logs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading audit logs...</AdminInlineState> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Log timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !filteredItems.length ? (
            <AdminEmptyState message="No audit logs found." />
          ) : null}
          {filteredItems.length > 0 ? (
            <>
              <AdminDataTable columns={columns} data={filteredItems} />
              <PaginationControls
                page={pageMeta.page}
                totalPages={pageMeta.total_pages}
                totalItems={pageMeta.total}
                disabled={loading}
                onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(pageMeta.total_pages || 1, prev + 1))}
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLogsPage;
