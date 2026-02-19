import React from "react";
import { Heart, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const EventCard = ({ listing, onToggleWishlist }) => {
  return (
    <article className="group">
      <Link to={`/listings/${listing.id}`} className="block">
        <div className="rounded-2xl overflow-hidden border bg-white shadow-sm">
          <div className="relative aspect-[1/1.05] overflow-hidden">
            <img
              src={listing.cover_image_url}
              alt={listing.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
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
              listing.is_wishlisted ? "text-primary border-primary" : "text-muted-foreground hover:text-primary"
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
