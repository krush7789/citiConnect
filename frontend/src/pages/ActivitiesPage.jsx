import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import FilterRow from "@/components/FilterRow";
import EventCard from "@/components/EventCard";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const ActivitiesPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [filters, setFilters] = useState(["All"]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const toggleWishlist = useWishlistToggle(setActivities);

  useEffect(() => {
    let mounted = true;
    listingService.getFilters({ city_id: cityId, types: "ACTIVITY" }).then((response) => {
      if (!mounted) return;
      setFilters(["All", ...(response.categories || ["Adventure", "Workshops", "Family"])]);
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
        types: "ACTIVITY",
        category: activeFilter !== "All" ? activeFilter : undefined,
        sort: "date",
        page: 1,
        page_size: 12,
      })
      .then((response) => {
        if (!mounted) return;
        setActivities(response.items || []);
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
      activities.slice(0, 4).map((activity) => ({
        id: activity.id,
        title: activity.title,
        subtitle: activity.description,
        date: activity.smart_date_label,
        location: activity.address,
        price: `From Rs ${activity.price_min}`,
        poster: activity.cover_image_url,
        ctaText: "Book tickets",
        bgColor: "#7c3aed",
      })),
    [activities]
  );

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16">
      <HeroCarousel slides={slides} onCta={(slide) => navigate(`/listings/${slide.id}`)} />

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">All activities</h2>
        <FilterRow filters={filters} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading activities...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-5">
            {activities.map((activity) => (
              <EventCard key={activity.id} listing={activity} onToggleWishlist={toggleWishlist} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ActivitiesPage;
