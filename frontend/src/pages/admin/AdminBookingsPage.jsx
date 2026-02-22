import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/api/services";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateOnly, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import PaginationControls from "@/components/common/PaginationControls";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const bookingStatuses = ["", ...Object.values(BOOKING_STATUS)];
const BOOKINGS_PAGE_SIZE = 25;

const AdminBookingsPage = () => {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: "",
    date_from: "",
    date_to: "",
    listing: "",
    user: "",
  });

  const bookingsQuery = useQuery({
    queryKey: ["admin-bookings", page, filters.status, filters.date_from, filters.date_to, filters.listing, filters.user],
    queryFn: () =>
      adminService.getBookings({
        status: filters.status || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        listing: filters.listing || undefined,
        user: filters.user || undefined,
        page,
        page_size: BOOKINGS_PAGE_SIZE,
      }),
  });

  const items = bookingsQuery.data?.items || [];
  const pageMeta = useMemo(
    () => ({
      page: bookingsQuery.data?.page || page,
      total_pages: bookingsQuery.data?.total_pages || 1,
      total: bookingsQuery.data?.total || 0,
    }),
    [bookingsQuery.data, page]
  );
  const loading = bookingsQuery.isLoading;
  const error = bookingsQuery.error?.normalized?.message || "";

  const columns = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "Booking",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <div>
            <p>{row.original.user?.name || "--"}</p>
            <p className="text-xs text-muted-foreground">{row.original.user?.email || "--"}</p>
          </div>
        ),
      },
      {
        accessorKey: "listing_title",
        header: "Listing",
        cell: ({ row }) => row.original.listing_title || "--",
      },
      {
        accessorKey: "listing_type",
        header: "Type",
        cell: ({ row }) => row.original.listing_type || "--",
      },
      {
        accessorKey: "occurrence_start",
        header: "Occurrence",
        cell: ({ row }) => formatDateTime(row.original.occurrence_start),
      },
      {
        accessorKey: "quantity",
        header: "Qty",
      },
      {
        accessorKey: "final_price",
        header: "Final price",
        cell: ({ row }) => formatCurrency(row.original.final_price),
      },
      {
        accessorKey: "status",
        header: "Status",
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatDateOnly(row.original.created_at),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Bookings Oversight"
        description="Operational booking monitor with status/date/listing/user filters."
      />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, status: event.target.value }));
                }}
              >
                {bookingStatuses.map((status) => (
                  <option key={status || "all"} value={status}>
                    {status || "All"}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date from</p>
              <Input
                type="date"
                value={filters.date_from}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, date_from: event.target.value }));
                }}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date to</p>
              <Input
                type="date"
                value={filters.date_to}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, date_to: event.target.value }));
                }}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Listing</p>
              <Input
                value={filters.listing}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, listing: event.target.value }));
                }}
                placeholder="Search listing"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">User</p>
              <Input
                value={filters.user}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, user: event.target.value }));
                }}
                placeholder="Name or email"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading bookings...</AdminInlineState> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <AdminEmptyState message="No bookings found for selected filters." />
          ) : null}

          {items.length > 0 ? (
            <>
              <AdminDataTable columns={columns} data={items} />
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

export default AdminBookingsPage;
