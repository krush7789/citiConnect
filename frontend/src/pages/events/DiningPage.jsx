import React, { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EventCard from "@/components/domain/EventCard";
import SortFilterModal from "@/components/common/SortFilterModal";
import useListings from "@/hooks/useListings";
import useSelectedCity from "@/hooks/useSelectedCity";
import useUserLocation from "@/hooks/useUserLocation";
import useWishlistToggle from "@/hooks/useWishlistToggle";
import { cn } from "@/lib/utils";

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

const shellClassNames = {
  page: "relative min-h-screen overflow-x-clip bg-[#efedf8] pb-16 dark:bg-[radial-gradient(120%_120%_at_50%_-10%,rgba(109,40,217,0.35),rgba(17,24,39,1)_45%,rgba(3,7,18,1)_100%)]",
  container: "container mx-auto px-4 md:px-8",
  sectionTitle: "text-center text-4xl font-black text-slate-900 md:text-5xl dark:text-violet-200",
  sectionUnderline: "mx-auto mt-3 h-1 -rotate-1 rounded-full bg-violet-500/90 dark:bg-violet-300",
  infoState:
    "rounded-lg border border-violet-200/75 bg-violet-50/85 p-5 text-sm text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/25 dark:text-violet-200/85",
  tape: "absolute -top-1 left-1/2 z-10 h-3 w-10 -translate-x-1/2 -rotate-6 bg-zinc-400/50 dark:bg-violet-200/20",
  frameShadow: "absolute inset-0 translate-x-[5px] translate-y-[5px] bg-black/90",
};

const getRotationClass = (index, evenRotation, oddRotation) => (index % 2 === 0 ? evenRotation : oddRotation);

const getListingImageUrl = (listing) =>
  (typeof listing?.cover_image_url === "string" && listing.cover_image_url.trim()) ||
  (typeof listing?.gallery_image_urls?.[0] === "string" && listing.gallery_image_urls[0].trim()) ||
  null;

const DecorativeStar = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute hidden text-4xl text-violet-500/70 md:block dark:text-violet-300/75",
      className
    )}
  >
    *
  </span>
);

const SectionHeading = ({ title, underlineWidth }) => (
  <>
    <h2 className={shellClassNames.sectionTitle}>{title}</h2>
    <div className={cn(shellClassNames.sectionUnderline, underlineWidth)} />
  </>
);

const FramedImage = ({
  image,
  alt,
  index,
  className,
  frameClassName,
  imageClassName,
  evenRotation = "-rotate-4",
  oddRotation = "rotate-4",
}) => (
  <div className={cn("relative inline-block", getRotationClass(index, evenRotation, oddRotation), className)}>
    <span className={shellClassNames.tape} />
    <span className={shellClassNames.frameShadow} />
    <div className={cn("relative border-[5px] border-black bg-[#cdb5ea] p-2 dark:border-violet-300 dark:bg-violet-950/70", frameClassName)}>
      {image ? (
        <img src={image} alt={alt} className={imageClassName} />
      ) : (
        <div className={cn("bg-gradient-to-br from-muted/70 via-muted/40 to-background", imageClassName)} />
      )}
    </div>
  </div>
);

const SpecialsSection = () => {
  return (
    <section className={shellClassNames.container}>
      <SectionHeading title="Enjoy iconic District specials" underlineWidth="w-64" />

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {specials.map((item, index) => (
          <article
            key={item.title}
            className="p-2 text-center dark:rounded-3xl dark:border dark:border-violet-400/20 dark:bg-slate-900/45 dark:shadow-[0_30px_85px_-62px_rgba(124,58,237,1)]"
          >
            <h3 className="text-4xl font-black tracking-tight text-slate-900 dark:text-violet-100 md:text-5xl">
              {item.title}
            </h3>
            <p className="mt-3 text-lg text-muted-foreground md:text-xl">{item.description}</p>
            <FramedImage
              image={item.image}
              alt={item.title}
              index={index}
              className="mt-6"
              frameClassName="pb-6"
              imageClassName="h-52 w-52 object-cover"
            />
          </article>
        ))}
      </div>
    </section>
  );
};

const DealsSection = ({ listings }) => {
  if (!listings.length) return null;

  return (
    <section className="container mx-auto mt-16 px-4 md:px-8">
      <SectionHeading title="Grab great deals and unlock extra savings" underlineWidth="w-72" />
      <div className="mt-8 grid gap-7 md:grid-cols-2">
        {listings.map((listing, index) => {
          const listingImageUrl = getListingImageUrl(listing);
          return (
            <article
              key={listing.id}
              className="grid items-center gap-5 rounded-2xl p-4 text-center dark:border dark:border-violet-400/20 dark:bg-slate-900/35 md:grid-cols-[1fr_auto] md:text-left"
            >
              <div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-violet-200 md:text-4xl">
                  {index === 0 ? "Up to 50% OFF" : "Buffets"}
                </h3>
                <p className="mt-2 text-lg text-muted-foreground">{listing.title}</p>
              </div>

              <FramedImage
                image={listingImageUrl}
                alt={listing.title}
                index={index}
                className="justify-self-center md:justify-self-end"
                frameClassName="pb-5"
                imageClassName="h-44 w-44 object-cover"
                evenRotation="-rotate-6"
                oddRotation="rotate-6"
              />
            </article>
          );
        })}
      </div>
    </section>
  );
};

const ListingsSection = ({
  loading,
  restaurants,
  distanceSortEnabled,
  userCoords,
  toggleWishlist,
  sortLabel,
  distanceSortMessage,
  isFilterModalOpen,
  setIsFilterModalOpen,
  sort,
  setSort,
  setPage,
  navigate,
}) => (
  <section className="container mx-auto mt-16 px-4 md:px-8">
    <div className="mb-5 flex items-center justify-between">
      <h2 className="text-2xl font-black text-slate-900 dark:text-violet-100 md:text-3xl">Dining near you</h2>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-200/90 bg-violet-50/90 px-3 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-400/30 dark:bg-violet-900/35 dark:text-violet-200 dark:hover:bg-violet-900/55"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300"
          onClick={() => navigate("/search?types=RESTAURANT")}
        >
          View all
        </button>
      </div>
    </div>

    <p className="mb-2 text-xs text-muted-foreground">Sort by: {sortLabel}</p>
    {distanceSortMessage ? <p className="mb-4 text-xs text-muted-foreground">{distanceSortMessage}</p> : null}

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
      <div className={shellClassNames.infoState}>Loading restaurants...</div>
    ) : restaurants.length === 0 ? (
      <div className={shellClassNames.infoState}>No restaurants found for your search.</div>
    ) : (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
  </section>
);

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

  const listingsQuery = useListings({
    cityId,
    types: "RESTAURANT",
    query,
    sort,
    page,
    pageSize: 12,
    userCoords,
    distanceSortEnabled,
    locationLoading,
  });

  useEffect(() => {
    setRestaurants(listingsQuery.data?.items || []);
  }, [listingsQuery.data]);

  const loading = listingsQuery.isLoading || (distanceSortEnabled && locationLoading);

  const topDeals = useMemo(() => restaurants.filter((item) => item.offer_text).slice(0, 2), [restaurants]);

  const distanceSortMessage = useMemo(() => {
    if (!distanceSortEnabled) return "";
    if (locationLoading) return "Getting your location to sort by distance...";
    if (userCoords) return "Showing restaurants nearest to your location.";
    return locationError || "Location unavailable. Showing popularity instead.";
  }, [distanceSortEnabled, locationLoading, userCoords, locationError]);

  return (
    <div className={shellClassNames.page}>
      <DecorativeStar className="left-[11%] top-[43%]" />
      <DecorativeStar className="right-[12%] top-[36%]" />

      <section className="pt-10 pb-16">
        <div className={shellClassNames.container}>
          <div className="mx-auto max-w-5xl rounded-[34px] border border-violet-300/45 bg-[#ddd8ef] px-6 py-12 text-center shadow-[0_24px_70px_-58px_rgba(109,40,217,0.65)] md:px-14 md:py-16 dark:border-violet-400/20 dark:bg-gradient-to-br dark:from-slate-900 dark:via-violet-950/45 dark:to-fuchsia-950/35 dark:shadow-[0_45px_110px_-60px_rgba(91,33,182,0.95)]">
            <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-6xl dark:bg-gradient-to-r dark:from-violet-200 dark:via-fuchsia-300 dark:to-indigo-300 dark:bg-clip-text dark:text-transparent">
              Discover restaurants, explore menus, book tables
              <br />
              - all in one place
            </h1>

            <div className="relative mx-auto mt-10 max-w-[560px]">
              <Search className="absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 text-violet-500 dark:text-violet-300" />
              <input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Search for a restaurant name"
                className="h-16 w-full rounded-[28px] border border-[#cbc8d8] bg-[#f4f3f7] pl-16 pr-5 text-2xl leading-none text-slate-900 shadow-sm placeholder:text-slate-500/85 focus-visible:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/35 dark:border-violet-500/35 dark:bg-slate-900/80 dark:text-violet-100 dark:placeholder:text-violet-200/45 dark:focus-visible:border-violet-300 dark:focus-visible:ring-violet-500/35 md:text-[34px]"
              />
            </div>
          </div>
        </div>
      </section>

      <SpecialsSection />
      <DealsSection listings={topDeals} />
      <ListingsSection
        loading={loading}
        restaurants={restaurants}
        distanceSortEnabled={distanceSortEnabled}
        userCoords={userCoords}
        toggleWishlist={toggleWishlist}
        sortLabel={sortLabel}
        distanceSortMessage={distanceSortMessage}
        isFilterModalOpen={isFilterModalOpen}
        setIsFilterModalOpen={setIsFilterModalOpen}
        sort={sort}
        setSort={setSort}
        setPage={setPage}
        navigate={navigate}
      />
    </div>
  );
};

export default DiningPage;
