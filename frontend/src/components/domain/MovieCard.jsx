import React from "react";
import { Heart, Star } from "lucide-react";
import { Link } from "react-router-dom";

const MovieCard = ({ listing, compact = false, onToggleWishlist }) => {
  const coverImageUrl =
    (typeof listing.cover_image_url === "string" && listing.cover_image_url.trim()) ||
    (typeof listing.gallery_image_urls?.[0] === "string" && listing.gallery_image_urls[0].trim()) ||
    null;

  return (
    <article className="group">
      <Link to={`/listings/${listing.id}`} className="block">
        <div className="relative rounded-2xl overflow-hidden shadow-sm border bg-card text-card-foreground">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt={listing.title}
              className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${compact ? "aspect-[3/4]" : "aspect-[3/4]"}`}
            />
          ) : (
            <div
              className={`w-full bg-gradient-to-br from-muted/70 via-muted/40 to-background ${compact ? "aspect-[3/4]" : "aspect-[3/4]"}`}
              aria-label={`${listing.title} placeholder image`}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/75 to-transparent">
            <div className="flex items-center justify-between text-white">
              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                <Star className="h-3.5 w-3.5 fill-current" />
                {listing.metadata?.certification || "U/A"}
              </span>
              <span className="text-xs">{listing.metadata?.language || "Hindi"}</span>
            </div>
          </div>
        </div>
      </Link>

      <div className="pt-2 px-0.5 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-tight line-clamp-1">{listing.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{listing.category}</p>
        </div>
        {onToggleWishlist ? (
          <button
            type="button"
            onClick={() => onToggleWishlist(listing)}
            className={`h-8 w-8 rounded-full border grid place-content-center transition ${
              listing.is_wishlisted
                ? "text-primary border-primary bg-primary/5"
                : "text-muted-foreground border-input hover:text-foreground hover:border-foreground/30"
            }`}
            aria-label="Toggle wishlist"
          >
            <Heart className={`h-4 w-4 ${listing.is_wishlisted ? "fill-current" : ""}`} />
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default MovieCard;
