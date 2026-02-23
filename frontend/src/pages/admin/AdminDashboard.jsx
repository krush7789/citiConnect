import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  CircleDollarSign,
  LayoutGrid,
  ListChecks,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { adminService } from "@/api/services";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const statMeta = [
  {
    key: "total_listings",
    title: "Total listings",
    caption: "All catalog entries",
    icon: LayoutGrid,
    tone: "text-indigo-700 bg-indigo-50 ring-indigo-100",
  },
  {
    key: "active_listings",
    title: "Published listings",
    caption: "Currently visible",
    icon: Activity,
    tone: "text-emerald-700 bg-emerald-50 ring-emerald-100",
  },
  {
    key: "total_bookings",
    title: "Total bookings",
    caption: "All-time transactions",
    icon: ListChecks,
    tone: "text-amber-700 bg-amber-50 ring-amber-100",
  },
  {
    key: "bookings_today",
    title: "Bookings today",
    caption: "Last 24 hours",
    icon: CalendarCheck2,
    tone: "text-violet-700 bg-violet-50 ring-violet-100",
  },
  {
    key: "active_users",
    title: "Active users",
    caption: "Users with bookings",
    icon: UsersRound,
    tone: "text-cyan-700 bg-cyan-50 ring-cyan-100",
  },
  {
    key: "total_revenue",
    title: "Total revenue",
    caption: "Confirmed bookings",
    icon: CircleDollarSign,
    tone: "text-rose-700 bg-rose-50 ring-rose-100",
    currency: true,
  },
];

const statusTone = {
  HOLD: "bg-amber-100 text-amber-700 border border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELLED: "bg-rose-100 text-rose-700 border border-rose-200",
  EXPIRED: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  FAILED: "bg-zinc-100 text-zinc-700 border border-zinc-200",
};

const pieChartColors = [
  "#4f46e5",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#0ea5e9",
  "#84cc16",
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => adminService.getDashboard(),
  });

  const dashboard = dashboardQuery.data || {
    stats: {},
    recent_bookings: [],
    top_listings: [],
    category_sales: [],
  };
  const loading = dashboardQuery.isLoading;
  const error = dashboardQuery.error?.normalized?.message || "";

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

  const recentBookingColumns = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "Booking",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        accessorKey: "user_name",
        header: "User",
      },
      {
        accessorKey: "listing_title",
        header: "Listing",
      },
      {
        accessorKey: "quantity",
        header: "Qty",
      },
      {
        accessorKey: "final_price",
        header: "Amount",
        cell: ({ row }) => formatCurrency(row.original.final_price),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className={`text-xs rounded-full px-2 py-1 ${statusTone[row.original.status] || "bg-zinc-100 text-zinc-700"}`}>
            {row.original.status}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
    ],
    []
  );

  const categorySales = useMemo(
    () =>
      (dashboard.category_sales || [])
        .map((item) => ({
          category: item.category || "Uncategorized",
          total_bookings: Number(item.total_bookings || 0),
          total_sales: Number(item.total_sales || 0),
        }))
        .filter((item) => item.total_bookings > 0 || item.total_sales > 0),
    [dashboard.category_sales]
  );

  const chartTotalRevenue = useMemo(
    () => categorySales.reduce((sum, item) => sum + item.total_sales, 0),
    [categorySales]
  );

  const pieSlices = useMemo(() => {
    if (!categorySales.length || chartTotalRevenue <= 0) return [];

    return categorySales.map((item, index) => {
      const percentage = (item.total_sales / chartTotalRevenue) * 100;
      return {
        ...item,
        percentage,
        color: pieChartColors[index % pieChartColors.length],
      };
    });
  }, [categorySales, chartTotalRevenue]);

  const pieGradient = useMemo(() => {
    if (!pieSlices.length) return "conic-gradient(#e5e7eb 0deg 360deg)";

    let runningAngle = 0;
    const stops = pieSlices.map((slice) => {
      const start = runningAngle;
      const end = start + (slice.percentage / 100) * 360;
      runningAngle = end;
      return `${slice.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [pieSlices]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Live business KPIs, recent transactions, and category performance."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/admin/listings")}>
              Manage listings
            </Button>
            <Button onClick={() => navigate("/admin/bookings")}>Open bookings</Button>
          </>
        }
      />

      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading dashboard...</AdminInlineState> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="border-slate-200/80 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className={`h-11 w-11 rounded-xl grid place-content-center ring-1 ${card.tone}`}>
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Live
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-black leading-none">{card.value}</p>
                  <p className="text-sm font-medium text-foreground mt-2">{card.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.caption}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl inline-flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary" />
                    Recent bookings
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Latest transactions across listings and users.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/bookings")}>
                  View all
                  <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dashboard.recent_bookings?.length ? (
                <AdminDataTable columns={recentBookingColumns} data={dashboard.recent_bookings} />
              ) : (
                <AdminEmptyState message="No recent bookings found." />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl inline-flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Category wise listing sales
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confirmed booking revenue split by listing category.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total tracked revenue</p>
                  <p className="text-sm font-semibold">{formatCurrency(chartTotalRevenue)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {categorySales.length ? (
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-center">
                  <div className="mx-auto">
                    <div
                      className="relative h-44 w-44 rounded-full border border-slate-200 shadow-sm"
                      style={{ background: pieGradient }}
                    >
                      <div className="absolute inset-6 rounded-full bg-card border border-slate-200 grid place-content-center text-center">
                        <p className="text-[11px] text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold">{formatCurrency(chartTotalRevenue)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {pieSlices.map((slice, index) => (
                      <div key={`${slice.category}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: slice.color }}
                          />
                          <p className="text-sm font-medium truncate">{slice.category}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{slice.percentage.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(slice.total_sales)} • {slice.total_bookings.toLocaleString("en-IN")} bookings
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <AdminEmptyState message="No confirmed booking sales found for categories yet." />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Top listings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.top_listings?.length ? (
              dashboard.top_listings.map((listing, index) => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => navigate(`/admin/listings/${listing.id}/occurrences`)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        Rank #{index + 1}
                      </p>
                      <p className="font-semibold mt-2 line-clamp-2">{listing.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {Number(listing.total_bookings || 0).toLocaleString("en-IN")} bookings
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
                  </div>
                </button>
              ))
            ) : (
              <AdminEmptyState message="No listings data available." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
