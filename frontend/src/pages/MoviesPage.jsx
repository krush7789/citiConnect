import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroCarousel from "@/components/HeroCarousel";
import FilterRow from "@/components/FilterRow";
import MovieCard from "@/components/MovieCard";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const MoviesPage = () => {
  const navigate = useNavigate();
  const cityId = useSelectedCity();
  const [filters, setFilters] = useState(["All"]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  const toggleWishlist = useWishlistToggle(setMovies);

  useEffect(() => {
    let mounted = true;
    listingService.getFilters({ city_id: cityId, types: "MOVIE" }).then((response) => {
      if (!mounted) return;
      const categories = response.categories?.length ? response.categories : ["Hindi", "English"];
      setFilters(["All", ...categories]);
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
        types: "MOVIE",
        category: activeFilter !== "All" ? activeFilter : undefined,
        sort: "newest",
        page: 1,
        page_size: 18,
      })
      .then((response) => {
        if (!mounted) return;
        setMovies(response.items || []);
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
        <h2 className="text-2xl font-bold mb-4">Only in theatres</h2>
        <FilterRow filters={filters} activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading movies...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-5">
            {movies.map((movie) => (
              <MovieCard key={movie.id} listing={movie} compact onToggleWishlist={toggleWishlist} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default MoviesPage;
