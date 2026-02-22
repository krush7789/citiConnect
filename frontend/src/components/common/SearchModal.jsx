import React, { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchService } from "@/api/services";
import { LISTING_TYPE } from "@/lib/enums";

const categories = [
  { label: "All", value: "" },
  { label: "Dining", value: LISTING_TYPE.RESTAURANT },
  { label: "Events", value: LISTING_TYPE.EVENT },
  { label: "Movies", value: LISTING_TYPE.MOVIE },
  { label: "Activities", value: LISTING_TYPE.ACTIVITY },
];

const SearchModal = ({ onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const recentSearches = useMemo(
    () => ["Mardaani 3", "Karan Aujla", "F9 Go Karting", "Comorin"],
    []
  );

  useEffect(() => {
    let mounted = true;
    const hasSearchInput = Boolean(query.trim()) || Boolean(activeType);
    if (!hasSearchInput) {
      setLoading(false);
      setResults([]);
      return () => {
        mounted = false;
      };
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await searchService.search({
          q: query || undefined,
          types: activeType || undefined,
          page: 1,
          page_size: 8,
        });
        if (mounted) setResults(response.items || []);
      } catch {
        if (mounted) setResults([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 450); // Increased debounce to 450ms to reduce unneeded API requests

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [query, activeType]);

  const goToListing = (id) => {
    navigate(`/listings/${id}`);
    onClose();
  };

  const goToSearch = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (activeType) params.set("types", activeType);
    navigate(`/search?${params.toString()}`);
    onClose();
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for movies, events, dining and activities"
            className="pl-9 h-11"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Badge
            key={category.label}
            onClick={() => setActiveType(category.value)}
            className={`cursor-pointer px-3 py-1 rounded-full border ${activeType === category.value ? "bg-primary text-primary-foreground" : "bg-white text-foreground"
              }`}
          >
            {category.label}
          </Badge>
        ))}
      </div>

      {!query ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Recent searches</p>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setQuery(term)}
                className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loading ? <p className="text-sm text-muted-foreground">Searching...</p> : null}
        {!loading &&
          results.map((item) => (
            <button
              type="button"
              key={item.id}
              className="w-full text-left rounded-xl border p-3 hover:border-primary hover:bg-muted/40 transition"
              onClick={() => goToListing(item.id)}
            >
              <p className="font-semibold text-sm">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {item.type} · {item.city} · from Rs {item.price_min}
              </p>
            </button>
          ))}
        {!loading && query && results.length === 0 ? <p className="text-sm text-muted-foreground">No results found.</p> : null}
      </div>

      <div className="pt-1">
        <Button className="w-full" onClick={goToSearch}>
          Open full search
        </Button>
      </div>
    </div>
  );
};

export default SearchModal;
