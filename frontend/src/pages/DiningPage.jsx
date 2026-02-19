import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import EventCard from "@/components/EventCard";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const specials = [
  {
    title: "Signature packages",
    description: "Curated menus and selections across the best spots in town",
    image:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Peak hour booking",
    description: "Skip the queue with priority table access at partner venues",
    image:
      "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "On-the-house",
    description: "Complimentary delights with your favorite meals",
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
  },
];

const DiningPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState([]);

  const toggleWishlist = useWishlistToggle(setRestaurants);

  useEffect(() => {
    let mounted = true;
    listingService
      .getListings({
        city_id: cityId,
        types: "RESTAURANT",
        q: query || undefined,
        sort: "popularity",
        page: 1,
        page_size: 8,
      })
      .then((response) => {
        if (!mounted) return;
        setRestaurants(response.items || []);
      });

    return () => {
      mounted = false;
    };
  }, [cityId, query]);

  const topDeals = useMemo(() => restaurants.slice(0, 2), [restaurants]);
  const slides = useMemo(
    () =>
      restaurants.slice(0, 4).map((restaurant) => ({
        id: restaurant.id,
        title: restaurant.title,
        subtitle: restaurant.category || "Dining",
        date: restaurant.smart_date_label || "Available now",
        location: restaurant.address,
        price: `From Rs ${restaurant.price_min}`,
        poster: restaurant.cover_image_url,
        ctaText: "Reserve table",
        bgColor: "#78350f",
      })),
    [restaurants]
  );

  return (
    <div className="pb-16">
      <div className="container mx-auto px-4 md:px-8">
        <HeroCarousel slides={slides} onCta={(slide) => navigate(`/listings/${slide.id}`)} />
      </div>

      <section className="bg-[#E8E4F8] py-12 px-4 md:px-8">
        <div className="max-w-4xl mx-auto bg-[#DDD8F5] rounded-3xl p-8 md:p-12 text-center border border-white/60">
          <h1 className="text-3xl md:text-4xl font-black max-w-2xl mx-auto leading-tight">
            Discover restaurants, explore menus, and book tables in one place
          </h1>
          <div className="relative max-w-xl mx-auto mt-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#7B5EA7]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for a restaurant name"
              className="w-full h-12 rounded-full pl-12 pr-4 outline-none border border-white/50"
            />
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-8 mt-12">
        <section>
          <h2 className="text-2xl md:text-3xl font-black text-center mb-8">Enjoy iconic CitiConnect specials</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {specials.map((item, index) => (
              <article key={item.title} className="text-center">
                <h3 className="font-bold text-lg">{item.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                <div
                  className={`bg-white border shadow mt-5 p-2 pb-6 inline-block ${
                    index % 2 === 0 ? "-rotate-2" : "rotate-2"
                  }`}
                >
                  <img src={item.image} alt={item.title} className="w-48 h-48 object-cover" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Dining near you</h2>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/search?types=RESTAURANT")}>
              View all
            </button>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {restaurants.map((listing) => (
              <EventCard key={listing.id} listing={listing} onToggleWishlist={toggleWishlist} />
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold mb-5">Grab great deals and unlock extra savings</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {topDeals.map((listing, index) => (
              <article key={listing.id} className="rounded-2xl border p-4 bg-white">
                <h3 className="font-bold text-lg">{index === 0 ? "Up to 50% OFF" : "Buffet specials"}</h3>
                <p className="text-sm text-muted-foreground mt-1">{listing.title}</p>
                <div className={`mt-4 inline-block bg-white border p-2 pb-5 shadow ${index % 2 === 0 ? "-rotate-2" : "rotate-2"}`}>
                  <img src={listing.cover_image_url} alt={listing.title} className="w-48 h-48 object-cover" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DiningPage;
