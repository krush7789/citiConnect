import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import FilterRow from "@/components/FilterRow";
import EventCard from "@/components/EventCard";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const EventsPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [filters, setFilters] = useState(["All"]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const toggleWishlist = useWishlistToggle(setEvents);

  useEffect(() => {
    let mounted = true;
    listingService.getFilters({ city_id: cityId, types: "EVENT" }).then((response) => {
      if (!mounted) return;
      setFilters(["All", ...(response.categories || ["Music", "Comedy", "Festival"])]);
    });
    return () => {
      mounted = false;
    };
  }, [cityId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listingService
      .getListings({
        city_id: cityId,
        types: "EVENT",
        category: activeFilter !== "All" ? activeFilter : undefined,
        sort: "date",
        page: 1,
        page_size: 12,
      })
      .then((response) => {
        if (!mounted) return;
        setEvents(response.items || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [cityId, activeFilter]);

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
        <h2 className="text-2xl font-bold mb-4">All events</h2>
        <FilterRow filters={filters} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading events...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-5">
            {events.map((event) => (
              <EventCard key={event.id} listing={event} onToggleWishlist={toggleWishlist} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default EventsPage;
