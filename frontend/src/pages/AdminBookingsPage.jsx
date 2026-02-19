import React, { useEffect, useState } from "react";
import { adminService } from "@/api/services";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateOnly, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const bookingStatuses = ["", ...Object.values(BOOKING_STATUS)];

const AdminBookingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    status: "",
    date_from: "",
    date_to: "",
    listing: "",
    user: "",
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    adminService
      .getBookings({
        status: filters.status || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        listing: filters.listing || undefined,
        user: filters.user || undefined,
        page: 1,
        page_size: 200,
      })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Failed to load bookings.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Bookings Oversight</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational booking monitor with status/date/listing/user filters.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {bookingStatuses.map((status) => (
                  <option key={status || "all"} value={status}>
                    {status || "All"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date from</p>
              <Input
                type="date"
                value={filters.date_from}
                onChange={(event) => setFilters((prev) => ({ ...prev, date_from: event.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date to</p>
              <Input
                type="date"
                value={filters.date_to}
                onChange={(event) => setFilters((prev) => ({ ...prev, date_to: event.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Listing</p>
              <Input
                value={filters.listing}
                onChange={(event) => setFilters((prev) => ({ ...prev, listing: event.target.value }))}
                placeholder="Search listing"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">User</p>
              <Input
                value={filters.user}
                onChange={(event) => setFilters((prev) => ({ ...prev, user: event.target.value }))}
                placeholder="Name or email"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading bookings...</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <div className="rounded-lg border p-5 text-sm text-muted-foreground">No bookings found for selected filters.</div>
          ) : null}

          {items.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Booking</th>
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Listing</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Occurrence</th>
                    <th className="text-left p-3">Qty</th>
                    <th className="text-left p-3">Final price</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((booking) => (
                    <tr key={booking.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{booking.id}</td>
                      <td className="p-3">
                        <p>{booking.user?.name || "--"}</p>
                        <p className="text-xs text-muted-foreground">{booking.user?.email || "--"}</p>
                      </td>
                      <td className="p-3">{booking.listing_title || "--"}</td>
                      <td className="p-3">{booking.listing_type || "--"}</td>
                      <td className="p-3">{formatDateTime(booking.occurrence_start)}</td>
                      <td className="p-3">{booking.quantity}</td>
                      <td className="p-3">{formatCurrency(booking.final_price)}</td>
                      <td className="p-3">{booking.status}</td>
                      <td className="p-3">{formatDateOnly(booking.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminBookingsPage;
