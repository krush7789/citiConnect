import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FilterRow from "@/components/FilterRow";
import EventCard from "@/components/EventCard";
import { listingService } from "@/api/services";
import useSelectedCity from "@/hooks/useSelectedCity";
import useWishlistToggle from "@/hooks/useWishlistToggle";

const sortOptions = ["relevance", "date", "price_asc", "price_desc", "newest", "popularity"];

const SearchPage = () => {
  const cityId = useSelectedCity();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(["All"]);
  const [items, setItems] = useState([]);
  const [pageMeta, setPageMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const q = params.get("q") || "";
  const types = params.get("types") || "";
  const category = params.get("category") || "All";
  const sort = params.get("sort") || "relevance";
  const page = Number(params.get("page") || 1);

  const toggleWishlist = useWishlistToggle(setItems);

  useEffect(() => {
    let mounted = true;
    listingService.getFilters({ city_id: cityId, types }).then((response) => {
      if (!mounted) return;
      setFilters(["All", ...(response.categories || [])]);
    });
    return () => {
      mounted = false;
    };
  }, [cityId, types]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listingService
      .getListings({
        city_id: cityId,
        q: q || undefined,
        types: types || undefined,
        category: category !== "All" ? category : undefined,
        sort,
        page,
        page_size: 12,
      })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
        setPageMeta({ page: response.page, total_pages: response.total_pages, total: response.total });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [cityId, q, types, category, sort, page]);

  const title = useMemo(() => {
    if (!q && !types) return "Search results";
    const parts = [];
    if (q) parts.push(`"${q}"`);
    if (types) parts.push(types);
    return `Results for ${parts.join(" · ")}`;
  }, [q, types]);

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <select
          value={sort}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            next.set("sort", event.target.value);
            next.set("page", "1");
            setParams(next);
          }}
          className="h-9 rounded-md border px-3 text-sm"
        >
          {sortOptions.map((option) => (
            <option key={option} value={option}>
              Sort: {option}
            </option>
          ))}
        </select>
      </div>

      <FilterRow
        filters={filters}
        activeFilter={category}
        onFilterChange={(nextCategory) => {
          const next = new URLSearchParams(params);
          next.set("category", nextCategory);
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
            <EventCard key={item.id} listing={item} onToggleWishlist={toggleWishlist} />
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Page {pageMeta.page} of {pageMeta.total_pages} · {pageMeta.total} results
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pageMeta.page <= 1}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(Math.max(1, pageMeta.page - 1)));
              setParams(next);
            }}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pageMeta.page >= pageMeta.total_pages}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(Math.min(pageMeta.total_pages, pageMeta.page + 1)));
              setParams(next);
            }}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
