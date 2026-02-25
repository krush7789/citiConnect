import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { TrendingUp, BarChartHorizontal } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import { SimpleBarChart, SimpleLineChart } from "@/components/admin/AdminSimpleCharts";
import AdminAnalyticsFilterBar from "./analytics/AdminAnalyticsFilterBar";
import {
  ANALYTICS_DEFAULT_FILTERS,
  areCustomDatesComplete,
  buildAnalyticsSearchString,
  buildDashboardAnalyticsParams,
  parseAnalyticsFiltersFromSearch,
} from "./analytics/analyticsFilters";

const PAGE_SIZE = 25;

const numberLabel = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN") : "0";

const AdminAnalyticsUsersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...ANALYTICS_DEFAULT_FILTERS,
    ...parseAnalyticsFiltersFromSearch(searchParams),
  }));
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [trendChartMode, setTrendChartMode] = useState("line");

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
    queryKey: ["analytics-users-cities"],
    queryFn: () => cityService.getCities(),
  });
  const cities = cityQuery.data?.items || [];

  const dashboardQuery = useQuery({
    queryKey: ["analytics-users-dashboard", dashboardParams],
    queryFn: () => adminService.getDashboard(dashboardParams),
    enabled: !isCustomRangeIncomplete,
  });
  const drillQuery = useQuery({
    queryKey: [
      "analytics-users-drill",
      dashboardParams,
      page,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      adminService.getDashboardDrill({
        ...dashboardParams,
        metric: "new_users",
        page,
        page_size: PAGE_SIZE,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
    enabled: !isCustomRangeIncomplete,
  });

  const onFilterChange = (key, rawValue) => {
    setPage(1);
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

  const chartData = useMemo(
    () =>
      (dashboardQuery.data?.analytics_series || []).map((item) => ({
        ...item,
        bucket_text: dayjs(item.bucket_start).format("DD MMM"),
      })),
    [dashboardQuery.data]
  );

  const items = drillQuery.data?.items || [];
  const pageMeta = {
    page: drillQuery.data?.page || page,
    total_pages: drillQuery.data?.total_pages || 1,
    total: drillQuery.data?.total || 0,
  };
  const loading = dashboardQuery.isLoading || drillQuery.isLoading;
  const error =
    drillQuery.error?.normalized?.message ||
    dashboardQuery.error?.normalized?.message ||
    "";

  const columns = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "User ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        accessorKey: "email",
        header: "Email",
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics - Users"
        description="New users KPI drill with trend and paginated user-level details."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/admin/dashboard${filtersQueryString ? `?${filtersQueryString}` : ""}`}>
                Dashboard
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/admin/analytics/revenue${filtersQueryString ? `?${filtersQueryString}` : ""}`}>
                Revenue analytics
              </Link>
            </Button>
          </>
        }
      />

      <AdminAnalyticsFilterBar
        filters={filters}
        cities={cities}
        onFilterChange={onFilterChange}
        includeSourceDimension={false}
        includeTopN={false}
        includeCity={false}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sort controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sort by</p>
              <Select
                value={sortBy}
                onChange={(event) => {
                  setPage(1);
                  setSortBy(event.target.value);
                }}
              >
                <option value="created_at">Created at</option>
                <option value="name">Name</option>
                <option value="email">Email</option>
                <option value="id">User ID</option>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Direction</p>
              <Select
                value={sortDir}
                onChange={(event) => {
                  setPage(1);
                  setSortDir(event.target.value);
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
          Select both custom dates to run user analytics.
        </AdminInlineState>
      ) : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading user analytics...</AdminInlineState> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">New Users Trend</CardTitle>
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setTrendChartMode("line")}
                className={`p-1.5 rounded-md transition ${trendChartMode === "line"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                aria-label="Line chart view"
              >
                <TrendingUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setTrendChartMode("bar")}
                className={`p-1.5 rounded-md transition ${trendChartMode === "bar"
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
        <CardContent className="h-72">
          {chartData.length ? (
            trendChartMode === "line" ? (
              <SimpleLineChart
                data={chartData}
                xKey="bucket_text"
                yKey="new_users"
                color="#2563eb"
                valueFormatter={(value) => numberLabel(value)}
              />
            ) : (
              <SimpleBarChart
                data={chartData}
                labelKey="bucket_text"
                valueKey="new_users"
                color="#2563eb"
                valueFormatter={(value) => numberLabel(value)}
              />
            )
          ) : (
            <AdminEmptyState message="No trend data available." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Drill Table</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <AdminEmptyState message="No users found for selected filters." />
          ) : null}
          {items.length ? (
            <>
              <AdminDataTable columns={columns} data={items} />
              <PaginationControls
                page={pageMeta.page}
                totalPages={pageMeta.total_pages}
                totalItems={pageMeta.total}
                disabled={loading}
                onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() =>
                  setPage((prev) => Math.min(pageMeta.total_pages || 1, prev + 1))
                }
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalyticsUsersPage;
