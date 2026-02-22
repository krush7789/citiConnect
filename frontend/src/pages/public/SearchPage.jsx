import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import FilterRow from "@/components/common/FilterRow";
import EventCard from "@/components/domain/EventCard";
import SortFilterModal from "@/components/common/SortFilterModal";
import PaginationControls from "@/components/common/PaginationControls";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useUserLocation from "@/hooks/useUserLocation";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const defaultSort = "relevance";

const sortOptions = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "price_asc", label: "Price: Low to high" },
  { value: "price_desc", label: "Price: High to low" },
  { value: "newest", label: "Newest" },
  { value: "popularity", label: "Popularity" },
  { value: "distance", label: "Distance" },
];

const SearchPage = () => {
  const cityId = useSelectedCity();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const q = params.get("q") || "";
  const types = params.get("types") || "";
  const category = params.get("category") || "All";
  const sort = params.get("sort") || defaultSort;
  const page = Number(params.get("page") || 1);
  const distanceSortEnabled = sort === "distance";
  const { coords: userCoords, loading: locationLoading, error: locationError } = useUserLocation(distanceSortEnabled);

  const toggleWishlist = useWishlistToggle(setItems);
  const sortLabel = useMemo(
    () => sortOptions.find((option) => option.value === sort)?.label || "Relevance",
    [sort]
  );

  const filtersQuery = useQuery({
    queryKey: ["listing-filters", "SEARCH", cityId || "all", types || "all"],
    queryFn: () => listingService.getFilters({ city_id: cityId, types }),
  });

  const filters = useMemo(() => ["All", ...(filtersQuery.data?.categories || [])], [filtersQuery.data]);

  const listingsQuery = useQuery({
    queryKey: [
      "listings-search",
      cityId || "all",
      q,
      types,
      category,
      sort,
      page,
      userCoords?.latitude || null,
      userCoords?.longitude || null,
    ],
    enabled: !(distanceSortEnabled && locationLoading),
    queryFn: () => {
      const effectiveSort = distanceSortEnabled && !userCoords ? defaultSort : sort;
      const queryParams = {
        city_id: cityId,
        q: q || undefined,
        types: types || undefined,
        category: category !== "All" ? category : undefined,
        sort: effectiveSort,
        page,
        page_size: 12,
      };
      if (distanceSortEnabled && userCoords) {
        queryParams.user_lat = userCoords.latitude;
        queryParams.user_lon = userCoords.longitude;
      }
      return listingService.getListings(queryParams);
    },
  });

  useEffect(() => {
    setItems(listingsQuery.data?.items || []);
  }, [listingsQuery.data]);

  const pageMeta = useMemo(
    () => ({
      page: listingsQuery.data?.page || page,
      total_pages: listingsQuery.data?.total_pages || 1,
      total: listingsQuery.data?.total || 0,
    }),
    [listingsQuery.data, page]
  );
  const loading = listingsQuery.isLoading || (distanceSortEnabled && locationLoading);

  const title = useMemo(() => {
    if (!q && !types) return "Search results";
    const parts = [];
    if (q) parts.push(`"${q}"`);
    if (types) parts.push(types);
    return `Results for ${parts.join(" - ")}`;
  }, [q, types]);

  const distanceSortMessage = useMemo(() => {
    if (!distanceSortEnabled) return "";
    if (locationLoading) return "Getting your location to sort by distance...";
    if (userCoords) return "Showing venues nearest to your location.";
    return locationError || "Location unavailable. Showing default sorting.";
  }, [distanceSortEnabled, locationLoading, userCoords, locationError]);

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-xs text-muted-foreground">Sort by: {sortLabel}</p>
      </div>
      {distanceSortMessage ? <p className="text-xs text-muted-foreground mb-4">{distanceSortMessage}</p> : null}

      <FilterRow
        filters={filters}
        activeFilter={category}
        onFiltersClick={() => setIsFilterModalOpen(true)}
        onFilterChange={(nextCategory) => {
          const next = new URLSearchParams(params);
          next.set("category", nextCategory);
          next.set("page", "1");
          setParams(next);
        }}
      />
      <SortFilterModal
        open={isFilterModalOpen}
        onOpenChange={setIsFilterModalOpen}
        sortOptions={sortOptions}
        selectedSort={sort}
        categoryOptions={filters}
        selectedCategory={category}
        onApply={({ sort: nextSort, category: nextCategory }) => {
          const next = new URLSearchParams(params);
          next.set("sort", nextSort || defaultSort);
          if (nextCategory && nextCategory !== "All") next.set("category", nextCategory);
          else next.delete("category");
          next.set("page", "1");
          setParams(next);
        }}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground mt-6">Loading results...</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border p-6 text-sm text-muted-foreground">
          No listings found. Try changing search query or filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-6">
          {items.map((item) => (
            <EventCard
              key={item.id}
              listing={item}
              onToggleWishlist={toggleWishlist}
              showDistance={distanceSortEnabled && Boolean(userCoords)}
            />
          ))}
        </div>
      )}

      <PaginationControls
        page={pageMeta.page}
        totalPages={pageMeta.total_pages}
        totalItems={pageMeta.total}
        disabled={loading}
        onPrevious={() => {
          const next = new URLSearchParams(params);
          next.set("page", String(Math.max(1, pageMeta.page - 1)));
          setParams(next);
        }}
        onNext={() => {
          const next = new URLSearchParams(params);
          next.set("page", String(Math.min(pageMeta.total_pages, pageMeta.page + 1)));
          setParams(next);
        }}
      />
    </div>
  );
};

export default SearchPage;
