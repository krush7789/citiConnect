import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PieChart, BarChartHorizontal } from "lucide-react";
import { adminService, cityService } from "@/api/services";
import PaginationControls from "@/components/common/PaginationControls";
import AdminDataTable from "@/components/admin/AdminDataTable";
import {
  AdminEmptyState,
  AdminInlineState,
  AdminPageHeader,
} from "@/components/admin/AdminPagePrimitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { SimpleBarChart, SimpleDonutChart } from "@/components/admin/AdminSimpleCharts";
import AdminAnalyticsFilterBar from "./analytics/AdminAnalyticsFilterBar";
import {
  ANALYTICS_DEFAULT_FILTERS,
  areCustomDatesComplete,
  buildAnalyticsSearchString,
  buildDashboardAnalyticsParams,
  parseAnalyticsFiltersFromSearch,
} from "./analytics/analyticsFilters";

const PAGE_SIZE = 25;
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

const numberLabel = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN") : "0";

const AdminAnalyticsRevenuePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...ANALYTICS_DEFAULT_FILTERS,
    ...parseAnalyticsFiltersFromSearch(searchParams),
  }));

  const [revenuePage, setRevenuePage] = useState(1);
  const [revenueSortBy, setRevenueSortBy] = useState("revenue");
  const [revenueSortDir, setRevenueSortDir] = useState("desc");
  const [revenueChartMode, setRevenueChartMode] = useState("donut");

  const isCustomRangeIncomplete = !areCustomDatesComplete(filters);
  const dashboardParams = useMemo(
    () => buildDashboardAnalyticsParams(filters),
    [filters]
  );
  const filtersQueryString = useMemo(
    () => buildAnalyticsSearchString(filters),
    [filters]
  );

  useEffect(() => {
    const nextSearch = buildAnalyticsSearchString(filters);
    setSearchParams(new URLSearchParams(nextSearch), { replace: true });
  }, [filters, setSearchParams]);

  const cityQuery = useQuery({
    queryKey: ["analytics-revenue-cities"],
    queryFn: () => cityService.getCities(),
  });
  const cities = cityQuery.data?.items || [];

  const revenueQuery = useQuery({
    queryKey: [
      "analytics-revenue-sources-drill",
      dashboardParams,
      revenuePage,
      revenueSortBy,
      revenueSortDir,
    ],
    queryFn: () =>
      adminService.getDashboardDrill({
        ...dashboardParams,
        metric: "revenue_sources",
        page: revenuePage,
        page_size: PAGE_SIZE,
        sort_by: revenueSortBy,
        sort_dir: revenueSortDir,
      }),
    enabled: !isCustomRangeIncomplete,
  });

  const onFilterChange = (key, rawValue) => {
    setRevenuePage(1);
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

  const revenueItems = revenueQuery.data?.items || [];
  const revenueMeta = {
    page: revenueQuery.data?.page || revenuePage,
    total_pages: revenueQuery.data?.total_pages || 1,
    total: revenueQuery.data?.total || 0,
  };
  const loading = revenueQuery.isLoading;
  const error = revenueQuery.error?.normalized?.message || "";

  const revenueColumns = useMemo(
    () => [
      {
        accessorKey: "key",
        header: "Revenue source",
      },
      {
        accessorKey: "revenue",
        header: "Revenue",
        cell: ({ row }) => formatCurrency(row.original.revenue),
      },
      {
        accessorKey: "bookings",
        header: "Bookings",
        cell: ({ row }) => numberLabel(row.original.bookings),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics - Revenue"
        description="Revenue sources analytics with paginated drill data."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/admin/dashboard${filtersQueryString ? `?${filtersQueryString}` : ""}`}>
                Dashboard
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/admin/analytics/users${filtersQueryString ? `?${filtersQueryString}` : ""}`}>
                Users analytics
              </Link>
            </Button>
          </>
        }
      />

      <AdminAnalyticsFilterBar
        filters={filters}
        cities={cities}
        onFilterChange={onFilterChange}
        includeTopN={false}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Revenue Source Sort</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sort by</p>
              <Select
                value={revenueSortBy}
                onChange={(event) => {
                  setRevenuePage(1);
                  setRevenueSortBy(event.target.value);
                }}
              >
                <option value="revenue">Revenue</option>
                <option value="bookings">Bookings</option>
                <option value="key">Source key</option>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Direction</p>
              <Select
                value={revenueSortDir}
                onChange={(event) => {
                  setRevenuePage(1);
                  setRevenueSortDir(event.target.value);
                }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isCustomRangeIncomplete ? (
        <AdminInlineState tone="error">
          Select both custom dates to run revenue analytics.
        </AdminInlineState>
      ) : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading revenue analytics...</AdminInlineState> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Revenue Sources</CardTitle>
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
        </CardHeader>
        <CardContent>
          {revenueItems.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start overflow-hidden">
              <div className="flex items-center justify-center min-h-[18rem] max-h-[22rem]">
                {revenueChartMode === "donut" ? (
                  <div className="h-[18rem] w-full flex items-center justify-center">
                    <SimpleDonutChart
                      data={revenueItems}
                      labelKey="key"
                      valueKey="revenue"
                      colors={pieChartColors}
                      hideLegend
                    />
                  </div>
                ) : (
                  <div className="h-[18rem] w-full overflow-y-auto pr-1">
                    <SimpleBarChart
                      data={revenueItems}
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
                {revenueItems.map((source, index) => {
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
                        <p className="text-[11px] text-muted-foreground">{numberLabel(bookings)} bookings</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <AdminEmptyState message="No revenue source data available." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue Source Drill Table</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !revenueItems.length ? (
            <AdminEmptyState message="No revenue rows found for selected filters." />
          ) : null}
          {revenueItems.length ? (
            <>
              <AdminDataTable columns={revenueColumns} data={revenueItems} />
              <PaginationControls
                page={revenueMeta.page}
                totalPages={revenueMeta.total_pages}
                totalItems={revenueMeta.total}
                disabled={loading}
                onPrevious={() => setRevenuePage((prev) => Math.max(1, prev - 1))}
                onNext={() =>
                  setRevenuePage((prev) => Math.min(revenueMeta.total_pages || 1, prev + 1))
                }
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalyticsRevenuePage;
