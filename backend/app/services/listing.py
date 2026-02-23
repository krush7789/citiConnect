from typing import Any

def format_listing_list_item(row: Any, next_occurrences: dict[Any, Any]) -> dict[str, Any]:
    """
    Format a database row from `list_listings` into a standardized ListingItem dictionary.
    This encapsulates the presentation logic to keep the API controllers clean.
    """
    listing, city, _venue, is_wishlisted, _next_start, *rest = row
    distance_km = float(rest[0]) if rest else None
    next_occurrence = next_occurrences.get(listing.id)
    
    gallery_image_urls = (
        listing.gallery_image_urls
        if isinstance(listing.gallery_image_urls, list)
        else []
    )
    if not gallery_image_urls and listing.cover_image_url:
        gallery_image_urls = [listing.cover_image_url]
    cover_image_url = listing.cover_image_url or (
        gallery_image_urls[0] if gallery_image_urls else None
    )

    item = {
        "id": listing.id,
        "type": listing.type,
        "title": listing.title,
        "category": listing.category,
        "cover_image_url": cover_image_url,
        "gallery_image_urls": gallery_image_urls,
        "city": {"id": city.id, "name": city.name, "state": city.state},
        "price_min": listing.price_min,
        "price_max": listing.price_max,
        "offer_text": listing.offer_text,
        "is_wishlisted": bool(is_wishlisted),
        "distance_km": round(distance_km, 3) if distance_km is not None else None,
        "next_occurrence": None,
    }

    if next_occurrence:
        item["next_occurrence"] = {
            "id": next_occurrence.id,
            "start_time": next_occurrence.start_time,
            "capacity_remaining": next_occurrence.capacity_remaining,
            "status": next_occurrence.status,
        }
        
    return item
