import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/common/HeroCarousel";
import MovieCard from "@/components/domain/MovieCard";
import EventCard from "@/components/domain/EventCard";
import HorizontalCardCarousel from "@/components/common/HorizontalCardCarousel";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const HomePage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [featured, setFeatured] = useState([]);
  const [movies, setMovies] = useState([]);
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const toggleMovieWishlist = useWishlistToggle(setMovies);
  const toggleEventWishlist = useWishlistToggle(setEvents);
  const toggleActivityWishlist = useWishlistToggle(setActivities);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      listingService.getListings({ city_id: cityId, is_featured: true, page: 1, page_size: 10 }),
      listingService.getListings({ city_id: cityId, types: "MOVIE", sort: "newest", page: 1, page_size: 12 }),
      listingService.getListings({ city_id: cityId, types: "EVENT", sort: "date", page: 1, page_size: 12 }),
      listingService.getListings({ city_id: cityId, types: "ACTIVITY", sort: "popularity", page: 1, page_size: 12 }),
    ])
      .then(([featuredRes, moviesRes, eventsRes, activitiesRes]) => {
        if (!mounted) return;
        setFeatured(featuredRes.items || []);
        setMovies(moviesRes.items || []);
        setEvents(eventsRes.items || []);
        setActivities(activitiesRes.items || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [cityId]);

  const heroSlides = useMemo(
    () =>
      featured.slice(0, 4).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.description || item.category,
        date: item.smart_date_label,
        location: item.address,
        price: `From Rs ${item.price_min}`,
        poster: item.cover_image_url,
        bgColor: item.type === "MOVIE" ? "#1f2937" : "#e11d48",
        ctaText: "Book tickets",
      })),
    [featured]
  );

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16">
      <HeroCarousel
        slides={heroSlides}
        onCta={(slide) => {
          navigate(`/listings/${slide.id}`);
        }}
      />

      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Top movies near you</h2>
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/movies")}>
            See all
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading movies...</p>
        ) : null}
        {!loading && movies.length === 0 ? <p className="text-sm text-muted-foreground">No movies found for this city.</p> : null}
        {!loading && movies.length > 0 ? (
          <HorizontalCardCarousel
            items={movies}
            itemClassName="w-[46%] sm:w-[31%] lg:w-[23%] xl:w-[16.5%]"
            renderItem={(movie) => <MovieCard key={movie.id} listing={movie} compact onToggleWishlist={toggleMovieWishlist} />}
          />
        ) : null}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Events near you</h2>
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/events")}>
            See all
          </button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}
        {!loading && events.length === 0 ? <p className="text-sm text-muted-foreground">No events found for this city.</p> : null}
        {!loading && events.length > 0 ? (
          <HorizontalCardCarousel
            items={events}
            renderItem={(event) => <EventCard key={event.id} listing={event} onToggleWishlist={toggleEventWishlist} />}
          />
        ) : null}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Activities and experiences</h2>
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/activities")}>
            See all
          </button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading activities...</p> : null}
        {!loading && activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activities found for this city.</p>
        ) : null}
        {!loading && activities.length > 0 ? (
          <HorizontalCardCarousel
            items={activities}
            renderItem={(activity) => (
              <EventCard key={activity.id} listing={activity} onToggleWishlist={toggleActivityWishlist} />
            )}
          />
        ) : null}
      </section>
    </div>
  );
};

export default HomePage;
