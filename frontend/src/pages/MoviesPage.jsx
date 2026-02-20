import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import FilterRow from "@/components/FilterRow";
import MovieCard from "@/components/MovieCard";
import SortFilterModal from "@/components/SortFilterModal";
import PaginationControls from "@/components/PaginationControls";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useUserLocation from "@/hooks/useUserLocation";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "date", label: "Date" },
  { value: "popularity", label: "Popularity" },
  { value: "price_asc", label: "Price: Low to high" },
  { value: "price_desc", label: "Price: High to low" },
  { value: "distance", label: "Distance" },
];

const MoviesPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [activeFilter, setActiveFilter] = useState("All");
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const distanceSortEnabled = sort === "distance";
  const { coords: userCoords, loading: locationLoading, error: locationError } = useUserLocation(distanceSortEnabled);

  const toggleWishlist = useWishlistToggle(setMovies);
  const sortLabel = useMemo(
    () => sortOptions.find((option) => option.value === sort)?.label || "Newest",
    [sort]
  );

  useEffect(() => {
    setPage(1);
  }, [cityId]);

  const filtersQuery = useQuery({
    queryKey: ["listing-filters", "MOVIE", cityId || "all"],
    queryFn: () => listingService.getFilters({ city_id: cityId, types: "MOVIE" }),
  });

  const filters = useMemo(() => {
    const categories = filtersQuery.data?.categories;
    return ["All", ...(categories?.length ? categories : ["Hindi", "English"])];
  }, [filtersQuery.data]);

  useEffect(() => {
    if (filters.includes(activeFilter)) return;
    setActiveFilter("All");
  }, [filters, activeFilter]);

  const listingsQuery = useQuery({
    queryKey: [
      "listings-feed",
      "MOVIE",
      cityId || "all",
      activeFilter,
      sort,
      page,
      userCoords?.latitude || null,
      userCoords?.longitude || null,
    ],
    enabled: !(distanceSortEnabled && locationLoading),
    queryFn: () => {
      const effectiveSort = distanceSortEnabled && !userCoords ? "newest" : sort;
      const queryParams = {
        city_id: cityId,
        types: "MOVIE",
        category: activeFilter !== "All" ? activeFilter : undefined,
        sort: effectiveSort,
        page,
        page_size: 18,
      };
      if (distanceSortEnabled && userCoords) {
        queryParams.user_lat = userCoords.latitude;
        queryParams.user_lon = userCoords.longitude;
      }
      return listingService.getListings(queryParams);
    },
  });

  useEffect(() => {
    setMovies(listingsQuery.data?.items || []);
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
    if (userCoords) return "Showing theatres nearest to your location.";
    return locationError || "Location unavailable. Showing newest releases instead.";
  }, [distanceSortEnabled, locationLoading, userCoords, locationError]);

  const slides = useMemo(
    () =>
      movies.slice(0, 4).map((movie) => ({
        id: movie.id,
        title: movie.title,
        subtitle: `${movie.metadata?.certification || "U/A"} | ${movie.category}`,
        date: movie.smart_date_label,
        location: movie.address,
        price: `From Rs ${movie.price_min}`,
        poster: movie.cover_image_url,
        ctaText: "Book now",
        bgColor: "#312e81",
      })),
    [movies]
  );

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16">
      <HeroCarousel slides={slides} onCta={(slide) => navigate(`/listings/${slide.id}`)} />

      <section className="mt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-2xl font-bold">Only in theatres</h2>
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
            setSort(nextSort || "newest");
            setActiveFilter(nextCategory || "All");
          }}
        />

        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading movies...</p>
        ) : movies.length === 0 ? (
          <div className="mt-5 rounded-lg border p-5 text-sm text-muted-foreground">No movies found for the selected filters.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-5">
            {movies.map((movie) => (
              <MovieCard key={movie.id} listing={movie} compact onToggleWishlist={toggleWishlist} />
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

export default MoviesPage;


