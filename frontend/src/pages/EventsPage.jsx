import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import FilterRow from "@/components/FilterRow";
import EventCard from "@/components/EventCard";
import SortFilterModal from "@/components/SortFilterModal";
import PaginationControls from "@/components/PaginationControls";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useUserLocation from "@/hooks/useUserLocation";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const sortOptions = [
  { value: "date", label: "Date" },
  { value: "popularity", label: "Popularity" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to high" },
  { value: "price_desc", label: "Price: High to low" },
  { value: "distance", label: "Distance" },
];

const EventsPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [activeFilter, setActiveFilter] = useState("All");
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("date");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const distanceSortEnabled = sort === "distance";
  const { coords: userCoords, loading: locationLoading, error: locationError } = useUserLocation(distanceSortEnabled);

  const toggleWishlist = useWishlistToggle(setEvents);
  const sortLabel = useMemo(
    () => sortOptions.find((option) => option.value === sort)?.label || "Date",
    [sort]
  );

  useEffect(() => {
    setPage(1);
  }, [cityId]);

  const filtersQuery = useQuery({
    queryKey: ["listing-filters", "EVENT", cityId || "all"],
    queryFn: () => listingService.getFilters({ city_id: cityId, types: "EVENT" }),
  });

  const filters = useMemo(
    () => ["All", ...(filtersQuery.data?.categories || ["Music", "Comedy", "Festival"])],
    [filtersQuery.data]
  );

  useEffect(() => {
    if (filters.includes(activeFilter)) return;
    setActiveFilter("All");
  }, [filters, activeFilter]);

  const listingsQuery = useQuery({
    queryKey: [
      "listings-feed",
      "EVENT",
      cityId || "all",
      activeFilter,
      sort,
      page,
      userCoords?.latitude || null,
      userCoords?.longitude || null,
    ],
    enabled: !(distanceSortEnabled && locationLoading),
    queryFn: () => {
      const effectiveSort = distanceSortEnabled && !userCoords ? "date" : sort;
      const queryParams = {
        city_id: cityId,
        types: "EVENT",
        category: activeFilter !== "All" ? activeFilter : undefined,
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
    setEvents(listingsQuery.data?.items || []);
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

  const distanceSortMessage = useMemo(() => {
    if (!distanceSortEnabled) return "";
    if (locationLoading) return "Getting your location to sort by distance...";
    if (userCoords) return "Showing venues nearest to your location.";
    return locationError || "Location unavailable. Showing date-wise events instead.";
  }, [distanceSortEnabled, locationLoading, userCoords, locationError]);

  const slides = useMemo(
    () =>
      events.slice(0, 4).map((event) => ({
        id: event.id,
        title: event.title,
        subtitle: event.category,
        date: event.smart_date_label,
        location: event.address,
        price: `From Rs ${event.price_min}`,
        poster: event.cover_image_url,
        ctaText: "Book tickets",
        bgColor: "#be123c",
      })),
    [events]
  );

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16">
      <HeroCarousel slides={slides} onCta={(slide) => navigate(`/listings/${slide.id}`)} />

      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-2xl font-bold">All events</h2>
          <p className="text-xs text-muted-foreground">Sort by: {sortLabel}</p>
        </div>
        {distanceSortMessage ? <p className="text-xs text-muted-foreground mb-4">{distanceSortMessage}</p> : null}
        <FilterRow
          filters={filters}
          activeFilter={activeFilter}
          onFiltersClick={() => setIsFilterModalOpen(true)}
          onFilterChange={(next) => {
            setPage(1);
            setActiveFilter(next);
          }}
        />
        <SortFilterModal
          open={isFilterModalOpen}
          onOpenChange={setIsFilterModalOpen}
          sortOptions={sortOptions}
          selectedSort={sort}
          categoryOptions={filters}
          selectedCategory={activeFilter}
          onApply={({ sort: nextSort, category: nextCategory }) => {
            setPage(1);
            setSort(nextSort || "date");
            setActiveFilter(nextCategory || "All");
          }}
        />
        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading events...</p>
        ) : events.length === 0 ? (
          <div className="mt-5 rounded-lg border p-5 text-sm text-muted-foreground">No events found for the selected filters.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-5">
            {events.map((event) => (
              <EventCard
                key={event.id}
                listing={event}
                onToggleWishlist={toggleWishlist}
                showDistance={distanceSortEnabled && Boolean(userCoords)}
              />
            ))}
          </div>
        )}
        {!loading ? (
          <PaginationControls
            page={pageMeta.page}
            totalPages={pageMeta.total_pages}
            totalItems={pageMeta.total}
            onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(pageMeta.total_pages || 1, prev + 1))}
          />
        ) : null}
      </section>
    </div>
  );
};

export default EventsPage;

