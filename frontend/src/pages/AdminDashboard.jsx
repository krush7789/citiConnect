import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, CalendarCheck2, LayoutTemplate, ListChecks, IndianRupee, Users } from "lucide-react";
import { adminService } from "@/api/services";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const statMeta = [
  { key: "total_listings", title: "Total listings", icon: LayoutTemplate, tone: "text-blue-700 bg-blue-50" },
  { key: "active_listings", title: "Active listings", icon: Activity, tone: "text-emerald-700 bg-emerald-50" },
  { key: "total_bookings", title: "Total bookings", icon: ListChecks, tone: "text-amber-700 bg-amber-50" },
  { key: "bookings_today", title: "Bookings today", icon: CalendarCheck2, tone: "text-violet-700 bg-violet-50" },
  { key: "active_users", title: "Active users", icon: Users, tone: "text-fuchsia-700 bg-fuchsia-50" },
  { key: "total_revenue", title: "Total revenue", icon: IndianRupee, tone: "text-rose-700 bg-rose-50", currency: true },
];

const statusTone = {
  HOLD: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
  EXPIRED: "bg-zinc-200 text-zinc-700",
  FAILED: "bg-zinc-200 text-zinc-700",
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    stats: {},
    recent_bookings: [],
    top_listings: [],
  });

  useEffect(() => {
    let mounted = true;
    adminService
      .getDashboard()
      .then((response) => {
        if (!mounted) return;
        setDashboard(response || { stats: {}, recent_bookings: [], top_listings: [] });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const statCards = useMemo(
    () =>
      statMeta.map((meta) => ({
        ...meta,
        value: meta.currency
          ? formatCurrency(dashboard.stats?.[meta.key] || 0)
          : Number(dashboard.stats?.[meta.key] || 0).toLocaleString("en-IN"),
      })),
    [dashboard.stats]
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            KPI overview, latest bookings, and top performing listings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/listings")}>
            Manage listings
          </Button>
          <Button onClick={() => navigate("/admin/bookings")}>Open bookings</Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading dashboard...</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-lg grid place-content-center ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-2xl font-black mt-4">{card.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{card.title}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">Recent bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.recent_bookings?.length ? (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3">Booking</th>
                      <th className="text-left p-3">User</th>
                      <th className="text-left p-3">Listing</th>
                      <th className="text-left p-3">Qty</th>
                      <th className="text-left p-3">Amount</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recent_bookings.map((booking) => (
                      <tr key={booking.id} className="border-t">
                        <td className="p-3 font-mono text-xs">{booking.id}</td>
                        <td className="p-3">{booking.user_name}</td>
                        <td className="p-3">{booking.listing_title}</td>
                        <td className="p-3">{booking.quantity}</td>
                        <td className="p-3">{formatCurrency(booking.final_price)}</td>
                        <td className="p-3">
                          <span className={`text-xs rounded-full px-2 py-1 ${statusTone[booking.status] || "bg-zinc-100 text-zinc-700"}`}>
                            {booking.status}
                          </span>
                        </td>
                        <td className="p-3">{formatDateTime(booking.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border p-5 text-sm text-muted-foreground">No recent bookings found.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Top listings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.top_listings?.length ? (
              dashboard.top_listings.map((listing, index) => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => navigate(`/admin/listings/${listing.id}/occurrences`)}
                  className="w-full rounded-lg border p-3 text-left hover:bg-muted/40 transition"
                >
                  <p className="text-xs text-muted-foreground">#{index + 1}</p>
                  <p className="font-semibold mt-0.5">{listing.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Number(listing.total_bookings || 0).toLocaleString("en-IN")} bookings
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-lg border p-5 text-sm text-muted-foreground">No listings data available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
