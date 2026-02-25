import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { BarChart3, ListChecks, PieChart, BarChartHorizontal } from "lucide-react";
import { adminService, cityService } from "@/api/services";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import AdminDataTable from "@/components/admin/AdminDataTable";
import {
  AdminEmptyState,
  AdminInlineState,
  AdminPageHeader,
} from "@/components/admin/AdminPagePrimitives";
import {
  SimpleBarChart,
  SimpleDonutChart,
  SimpleLineChart,
} from "@/components/admin/AdminSimpleCharts";
import AdminAnalyticsFilterBar from "@/components/admin/analytics/AdminAnalyticsFilterBar";
import {
  ANALYTICS_DEFAULT_FILTERS,
  areCustomDatesComplete,
  buildAnalyticsSearchString,
  buildDashboardAnalyticsParams,
  parseAnalyticsFiltersFromSearch,
} from "@/components/admin/analytics/analyticsFilters";

const KPI_CARD_PAGE_SIZE = 3;
const TOP_LISTINGS_PAGE_SIZE = 4;

const statMeta = [
  {
    key: "total_listings",
    title: "Total listings",
    caption: "All catalog entries",
    href: "/admin/listings",
    formatter: (value) => Number(value || 0).toLocaleString("en-IN"),
  },
  {
    key: "active_listings",
    title: "Published listings",
    caption: "Currently visible",
    href: "/admin/listings",
    formatter: (value) => Number(value || 0).toLocaleString("en-IN"),
  },
  {
    key: "total_bookings",
    title: "Total bookings",
    caption: "All-time transactions",
    href: "/admin/bookings",
    formatter: (value) => Number(value || 0).toLocaleString("en-IN"),
  },
  {
    key: "bookings_today",
    title: "Bookings today",
    caption: "Latest booking activity",
    href: "/admin/bookings",
    formatter: (value) => Number(value || 0).toLocaleString("en-IN"),
  },
  {
    key: "active_users",
    title: "Active users",
    caption: "Users with bookings",
    analyticsRoute: "users",
    formatter: (value) => Number(value || 0).toLocaleString("en-IN"),
  },
  {
    key: "total_revenue",
    title: "Total revenue",
    caption: "Confirmed bookings",
    analyticsRoute: "revenue",
    formatter: (value) => formatCurrency(value || 0),
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
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
];

const chartTick = (value) => dayjs(value).format("DD MMM");

const toNumberLabel = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN") : "0";

const slicePage = (items, page, pageSize) => {
  const safeItems = Array.isArray(items) ? items : [];
  const totalPages = Math.max(1, Math.ceil(safeItems.length / pageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const offset = (normalizedPage - 1) * pageSize;
  return {
    items: safeItems.slice(offset, offset + pageSize),
    totalPages,
    page: normalizedPage,
  };
};

const Pager = ({ page, totalPages, onPrev, onNext }) => (
  <div className="flex items-center justify-end gap-2 mt-3">
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={page <= 1}
      onClick={onPrev}
    >
      Previous
    </Button>
    <span className="text-xs text-muted-foreground">
      Page {page} of {totalPages}
    </span>
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={page >= totalPages}
      onClick={onNext}
    >
      Next
    </Button>
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...ANALYTICS_DEFAULT_FILTERS,
    ...parseAnalyticsFiltersFromSearch(searchParams),
  }));
  const [kpiCardPage, setKpiCardPage] = useState(1);
  const [topListingsPage, setTopListingsPage] = useState(1);
  const [revenueChartMode, setRevenueChartMode] = useState("donut");
  const [revenueSortBy, setRevenueSortBy] = useState("revenue");
  const [revenueSortDir, setRevenueSortDir] = useState("desc");

  const isCustomRangeIncomplete = !areCustomDatesComplete(filters);
  const dashboardParams = useMemo(
    () => buildDashboardAnalyticsParams(filters),
    [filters]
  );
  const filtersQueryString = useMemo(
    () => buildAnalyticsSearchString(filters),
    [filters]
  );

  const cityQuery = useQuery({
    queryKey: ["admin-dashboard-cities"],
    queryFn: () => cityService.getCities(),
  });
  const cities = cityQuery.data?.items || [];

  useEffect(() => {
    const nextSearch = buildAnalyticsSearchString(filters);
    setSearchParams(new URLSearchParams(nextSearch), { replace: true });
  }, [filters, setSearchParams]);

  useEffect(() => {
    setKpiCardPage(1);
    setTopListingsPage(1);
  }, [dashboardParams]);

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard", dashboardParams],
    queryFn: () => adminService.getDashboard(dashboardParams),
    enabled: !isCustomRangeIncomplete,
  });

  const dashboard = dashboardQuery.data || {
    stats: {},
    recent_bookings: [],
    top_listings: [],
    analytics_series: [],
    analytics_breakdowns: {
      revenue_sources: [],
    },
  };
  const loading = dashboardQuery.isLoading;
  const error = dashboardQuery.error?.normalized?.message || "";

  const onFilterChange = (key, rawValue) => {
    setFilters((prev) => {
      if (key === "top_n") {
        const nextTopN = Math.min(25, Math.max(1, Number(rawValue) || 1));
        return { ...prev, top_n: nextTopN };
      }
      if (key === "preset" && rawValue !== "custom") {
        return { ...prev, preset: rawValue, date_from: "", date_to: "" };
      }
      return { ...prev, [key]: rawValue };
    });
  };

  const statCards = useMemo(
    () =>
      statMeta.map((meta) => ({
        ...meta,
        value: meta.formatter(dashboard.stats?.[meta.key]),
      })),
    [dashboard.stats]
  );

  const kpiPageData = useMemo(
    () => slicePage(statCards, kpiCardPage, KPI_CARD_PAGE_SIZE),
    [statCards, kpiCardPage]
  );

  const recentBookingColumns = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "Booking",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      { accessorKey: "user_name", header: "User" },
      { accessorKey: "listing_title", header: "Listing" },
      { accessorKey: "quantity", header: "Qty" },
      {
        accessorKey: "final_price",
        header: "Amount",
        cell: ({ row }) => formatCurrency(row.original.final_price),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`text-xs rounded-full px-2 py-1 ${statusTone[row.original.status] || "bg-zinc-100 text-zinc-700"
              }`}
          >
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

  const analyticsSeries = useMemo(
    () =>
      (dashboard.analytics_series || []).map((item) => ({
        ...item,
        bucket_text: chartTick(item.bucket_start),
      })),
    [dashboard.analytics_series]
  );

  const rawRevenueSources = dashboard.analytics_breakdowns?.revenue_sources || [];
  const revenueSources = useMemo(() => {
    const sorted = [...rawRevenueSources].sort((a, b) => {
      let aVal, bVal;
      if (revenueSortBy === "key") {
        aVal = String(a.key || "").toLowerCase();
        bVal = String(b.key || "").toLowerCase();
        return revenueSortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = Number(a[revenueSortBy] || 0);
      bVal = Number(b[revenueSortBy] || 0);
      return revenueSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [rawRevenueSources, revenueSortBy, revenueSortDir]);

  const topListingsPageData = useMemo(
    () => slicePage(dashboard.top_listings || [], topListingsPage, TOP_LISTINGS_PAGE_SIZE),
    [dashboard.top_listings, topListingsPage]
  );

  const getKpiCardNavigation = (card) => {
    if (card.href) return card.href;
    if (card.analyticsRoute) {
      return `/admin/analytics/${card.analyticsRoute}${filtersQueryString ? `?${filtersQueryString}` : ""
        }`;
    }
    return "/admin/dashboard";
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Core KPIs and drill-ready analytics."
      />

      <AdminAnalyticsFilterBar
        filters={filters}
        cities={cities}
        onFilterChange={onFilterChange}
      />

      {isCustomRangeIncomplete ? (
        <AdminInlineState tone="error">
          Select both custom dates to run dashboard analytics.
        </AdminInlineState>
      ) : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading dashboard...</AdminInlineState> : null}

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">KPI Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {kpiPageData.items.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => navigate(getKpiCardNavigation(card))}
                className="rounded-lg border border-slate-200 px-4 py-4 text-left hover:bg-slate-50 transition"
              >
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-semibold mt-1">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.caption}</p>
              </button>
            ))}
          </div>
          <Pager
            page={kpiPageData.page}
            totalPages={kpiPageData.totalPages}
            onPrev={() => setKpiCardPage((prev) => Math.max(1, prev - 1))}
            onNext={() =>
              setKpiCardPage((prev) => Math.min(kpiPageData.totalPages, prev + 1))
            }
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate(`/admin/analytics/users${filtersQueryString ? `?${filtersQueryString}` : ""}`)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">New Users Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {analyticsSeries.length ? (
              <SimpleLineChart data={analyticsSeries} xKey="bucket_text" yKey="new_users" color="#2563eb" />
            ) : (
              <AdminEmptyState message="No trend data available for selected filters." />
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate(`/admin/analytics/revenue${filtersQueryString ? `?${filtersQueryString}` : ""}`)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">ARPU Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {analyticsSeries.length ? (
              <SimpleBarChart
                data={analyticsSeries}
                labelKey="bucket_text"
                valueKey="arpu"
                color="#f59e0b"
                valueFormatter={(value) => formatCurrency(value)}
              />
            ) : (
              <AdminEmptyState message="No ARPU points available." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle
              className="text-lg cursor-pointer hover:text-primary transition-colors"
              onClick={() => navigate(`/admin/analytics/revenue${filtersQueryString ? `?${filtersQueryString}` : ""}`)}
            >
              Top Revenue Sources
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Select
                  value={revenueSortBy}
                  onChange={(e) => setRevenueSortBy(e.target.value)}
                  className="h-8 text-xs w-28"
                >
                  <option value="revenue">Revenue</option>
                  <option value="bookings">Bookings</option>
                  <option value="key">Name</option>
                </Select>
                <Select
                  value={revenueSortDir}
                  onChange={(e) => setRevenueSortDir(e.target.value)}
                  className="h-8 text-xs w-24"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </Select>
              </div>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <button
                  type="button"
                  onClick={() => setRevenueChartMode("donut")}
                  className={`p-1.5 rounded-md transition ${revenueChartMode === "donut"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                  aria-label="Donut chart view"
                >
                  <PieChart className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRevenueChartMode("bar")}
                  className={`p-1.5 rounded-md transition ${revenueChartMode === "bar"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                  aria-label="Bar chart view"
                >
                  <BarChartHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {revenueSources.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start overflow-hidden">
              <div className="flex items-center justify-center min-h-[18rem] max-h-[22rem]">
                {revenueChartMode === "donut" ? (
                  <div className="h-[18rem] w-full flex items-center justify-center">
                    <SimpleDonutChart
                      data={revenueSources}
                      labelKey="key"
                      valueKey="revenue"
                      colors={pieChartColors}
                      hideLegend
                    />
                  </div>
                ) : (
                  <div className="h-[18rem] w-full overflow-y-auto pr-1">
                    <SimpleBarChart
                      data={revenueSources}
                      labelKey="key"
                      valueKey="revenue"
                      color="#2563eb"
                      horizontal
                      maxItems={25}
                      valueFormatter={(value) => formatCurrency(value)}
                    />
                  </div>
                )}
              </div>
              <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-2">
                {revenueSources.map((source, index) => {
                  const revenue = Number(source.revenue || 0);
                  const bookings = Number(source.bookings || 0);
                  return (
                    <div
                      key={`${source.key}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: pieChartColors[index % pieChartColors.length] }}
                        />
                        <span className="text-sm truncate">{source.key || "--"}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold">{formatCurrency(revenue)}</p>
                        <p className="text-[11px] text-muted-foreground">{toNumberLabel(bookings)} bookings</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <AdminEmptyState message="No source breakdown available." />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl inline-flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Recent bookings
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/bookings")}>
                  View all
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
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl inline-flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Top listings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[26rem] overflow-y-auto">
            {topListingsPageData.items.length ? (
              <>
                {topListingsPageData.items.map((listing, index) => (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => navigate(`/admin/listings/${listing.id}/occurrences`)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition"
                  >
                    <p className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Rank #{(topListingsPageData.page - 1) * TOP_LISTINGS_PAGE_SIZE + index + 1}
                    </p>
                    <p className="font-semibold mt-2 line-clamp-2">{listing.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {toNumberLabel(listing.total_bookings)} bookings
                    </p>
                  </button>
                ))}
                <Pager
                  page={topListingsPageData.page}
                  totalPages={topListingsPageData.totalPages}
                  onPrev={() => setTopListingsPage((prev) => Math.max(1, prev - 1))}
                  onNext={() =>
                    setTopListingsPage((prev) =>
                      Math.min(topListingsPageData.totalPages, prev + 1)
                    )
                  }
                />
              </>
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
