import React from "react";
import { Heart, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceKm } from "@/lib/format";

const EventCard = ({ listing, onToggleWishlist, showDistance = false }) => {
  const distanceLabel = showDistance ? formatDistanceKm(listing.distance_km) : "";
  const coverImageUrl =
    (typeof listing.cover_image_url === "string" && listing.cover_image_url.trim()) ||
    (typeof listing.gallery_image_urls?.[0] === "string" && listing.gallery_image_urls[0].trim()) ||
    null;

  return (
    <article className="group">
      <Link to={`/listings/${listing.id}`} className="block">
        <div className="rounded-2xl overflow-hidden border bg-card text-card-foreground shadow-sm">
          <div className="relative aspect-[1/1.05] overflow-hidden">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div
                className="w-full h-full bg-gradient-to-br from-muted/70 via-muted/40 to-background"
                aria-label={`${listing.title} placeholder image`}
              />
            )}
            {listing.offer_text ? (
              <span className="absolute bottom-2 left-2 right-2 bg-black/70 text-white text-[11px] px-2 py-1 rounded-md line-clamp-1">
                {listing.offer_text}
              </span>
            ) : null}
          </div>
          <div className="p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-primary line-clamp-1">{listing.smart_date_label || "Multiple dates"}</p>
            <h3 className="font-semibold leading-tight line-clamp-2">{listing.title}</h3>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1 line-clamp-1">
              <MapPin className="h-3 w-3" />
              {listing.address || listing.city}
            </p>
            {showDistance && distanceLabel ? <p className="text-xs text-muted-foreground">{distanceLabel}</p> : null}
            <p className="text-xs text-muted-foreground">From Rs {listing.price_min}</p>
          </div>
        </div>
      </Link>
      {onToggleWishlist ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => onToggleWishlist(listing)}
            className={`h-8 px-3 rounded-full border text-xs inline-flex items-center gap-1 transition ${
              listing.is_wishlisted
                ? "text-primary border-primary bg-primary/5"
                : "text-muted-foreground border-input hover:text-foreground hover:border-foreground/30"
            }`}
            aria-label="Toggle wishlist"
          >
            <Heart className={`h-3.5 w-3.5 ${listing.is_wishlisted ? "fill-current" : ""}`} />
            Wishlist
          </button>
        </div>
      ) : null}
    </article>
  );
};

export default EventCard;
