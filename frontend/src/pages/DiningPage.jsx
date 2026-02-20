import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EventCard from "@/components/EventCard";
import SortFilterModal from "@/components/SortFilterModal";
import PaginationControls from "@/components/PaginationControls";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useUserLocation from "@/hooks/useUserLocation";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const specials = [
  {
    title: "Signature packages",
    description: "Curated menus and selections across the best spots in town",
    image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=700&q=80",
  },
  {
    title: "Peak hour booking",
    description: "Skip the queue with priority table access at partner venues",
    image: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=700&q=80",
  },
  {
    title: "On-the-house",
    description: "Complimentary delights with your favorite meals",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=700&q=80",
  },
];

const sortOptions = [
  { value: "popularity", label: "Popularity" },
  { value: "price_asc", label: "Price: Low to high" },
  { value: "price_desc", label: "Price: High to low" },
  { value: "newest", label: "Newest" },
  { value: "distance", label: "Distance" },
];

const DiningPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("popularity");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const distanceSortEnabled = sort === "distance";
  const { coords: userCoords, loading: locationLoading, error: locationError } = useUserLocation(distanceSortEnabled);

  const toggleWishlist = useWishlistToggle(setRestaurants);
  const sortLabel = useMemo(
    () => sortOptions.find((option) => option.value === sort)?.label || "Popularity",
    [sort]
  );

  useEffect(() => {
    setPage(1);
  }, [cityId]);

  const listingsQuery = useQuery({
    queryKey: [
      "listings-feed",
      "RESTAURANT",
      cityId || "all",
      query,
      sort,
      page,
      userCoords?.latitude || null,
      userCoords?.longitude || null,
    ],
    enabled: !(distanceSortEnabled && locationLoading),
    queryFn: () => {
      const effectiveSort = distanceSortEnabled && !userCoords ? "popularity" : sort;
      const queryParams = {
        city_id: cityId,
        types: "RESTAURANT",
        q: query || undefined,
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
    setRestaurants(listingsQuery.data?.items || []);
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

  const topDeals = useMemo(() => restaurants.filter((item) => item.offer_text).slice(0, 2), [restaurants]);
  const getListingImageUrl = (listing) =>
    (typeof listing?.cover_image_url === "string" && listing.cover_image_url.trim()) ||
    (typeof listing?.gallery_image_urls?.[0] === "string" && listing.gallery_image_urls[0].trim()) ||
    null;
  const distanceSortMessage = useMemo(() => {
    if (!distanceSortEnabled) return "";
    if (locationLoading) return "Getting your location to sort by distance...";
    if (userCoords) return "Showing restaurants nearest to your location.";
    return locationError || "Location unavailable. Showing popularity instead.";
  }, [distanceSortEnabled, locationLoading, userCoords, locationError]);

  return (
    <div className="min-h-screen bg-[#E8E3F6] pb-16">
      <section className="pt-10 pb-16">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mx-auto max-w-5xl rounded-[34px] border border-[#c7b8eb] bg-[#DCD3F2] px-6 py-12 md:px-14 md:py-16 text-center">
            <h1 className="mx-auto max-w-3xl text-4xl md:text-6xl font-black leading-tight tracking-tight text-[#101010]">
              Discover restaurants, explore menus, book tables - all in one place
            </h1>

            <div className="relative max-w-[560px] mx-auto mt-10">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-7 w-7 text-[#7B4EF2]" />
              <input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Search for a restaurant name"
                className="w-full h-16 rounded-[28px] border border-[#CEC6E2] bg-white/95 pl-16 pr-5 text-2xl md:text-[34px] leading-none outline-none shadow-[0_8px_20px_-16px_rgba(0,0,0,0.6)]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-8">
        <h2 className="text-center text-4xl md:text-5xl font-black text-[#171717]">Enjoy iconic District specials</h2>
        <div className="mx-auto mt-3 h-1 w-64 rounded-full bg-gradient-to-r from-transparent via-[#7B4EF2] to-transparent" />

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          {specials.map((item, index) => (
            <article key={item.title} className="text-center">
              <h3 className="text-4xl md:text-5xl font-black tracking-tight text-[#151515]">{item.title}</h3>
              <p className="mt-3 text-lg md:text-xl text-[#4a4a4a]">{item.description}</p>
              <div
                className={`mt-6 inline-block bg-white border border-[#d8d8d8] p-2 pb-6 shadow-[0_22px_38px_-28px_rgba(0,0,0,0.8)] ${
                  index % 2 === 0 ? "-rotate-2" : "rotate-2"
                }`}
              >
                <img src={item.image} alt={item.title} className="h-52 w-52 object-cover" />
              </div>
            </article>
          ))}
        </div>
      </section>

      {topDeals.length ? (
        <section className="container mx-auto px-4 md:px-8 mt-16">
          <h2 className="text-center text-4xl md:text-5xl font-black text-[#171717]">Grab great deals and unlock extra savings</h2>
          <div className="grid md:grid-cols-2 gap-7 mt-8">
            {topDeals.map((listing, index) => {
              const listingImageUrl = getListingImageUrl(listing);
              return (
                <article key={listing.id} className="rounded-2xl border border-[#d7d0eb] bg-[#f8f7fd] p-6 text-center">
                  <h3 className="text-3xl md:text-4xl font-black text-[#151515]">{index === 0 ? "Up to 50% OFF" : "Buffets"}</h3>
                  <p className="text-lg text-[#4a4a4a] mt-2">{listing.title}</p>
                  <div className={`mt-5 inline-block bg-white border p-2 pb-5 shadow ${index % 2 === 0 ? "-rotate-2" : "rotate-2"}`}>
                    {listingImageUrl ? (
                      <img
                        src={listingImageUrl}
                        alt={listing.title}
                        className="h-44 w-44 object-cover"
                      />
                    ) : (
                      <div className="h-44 w-44 bg-gradient-to-br from-muted/70 via-muted/40 to-background" />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="container mx-auto px-4 md:px-8 mt-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl md:text-3xl font-black text-[#171717]">Dining near you</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
              className="h-9 rounded-lg border px-3 text-xs font-medium inline-flex items-center gap-1.5 bg-white"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
            <button
              type="button"
              className="text-sm text-[#6b3fe6] hover:underline"
              onClick={() => navigate("/search?types=RESTAURANT")}
            >
              View all
            </button>
          </div>
        </div>
        <p className="text-xs text-[#4a4a4a] mb-2">Sort by: {sortLabel}</p>
        {distanceSortMessage ? <p className="text-xs text-[#4a4a4a] mb-4">{distanceSortMessage}</p> : null}
        <SortFilterModal
          open={isFilterModalOpen}
          onOpenChange={setIsFilterModalOpen}
          sortOptions={sortOptions}
          selectedSort={sort}
          onApply={({ sort: nextSort }) => {
            setPage(1);
            setSort(nextSort || "popularity");
          }}
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading restaurants...</p>
        ) : restaurants.length === 0 ? (
          <div className="rounded-lg border border-[#d7d0eb] bg-white/70 p-5 text-sm text-[#4a4a4a]">
            No restaurants found for your search.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {restaurants.map((listing) => (
              <EventCard
                key={listing.id}
                listing={listing}
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

export default DiningPage;


