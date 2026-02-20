from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.repository.listing import get_next_occurrences_for_listing_ids
from app.repository.wishlist import (
    add_wishlist_item,
    is_published_listing,
    list_user_wishlist,
    remove_wishlist_item,
)
from app.schema.common import MessageResponse, PaginatedResponse
from app.schema.listing import ListingItem
from app.schema.wishlist import WishlistCreateRequest
from app.services.popularity import on_wishlist_change
from app.utils.pagination import build_paginated_response

router = APIRouter(prefix="/wishlists", tags=["wishlists"])


@router.get("", response_model=PaginatedResponse[ListingItem])
async def get_wishlist(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await list_user_wishlist(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )

    listing_ids = [row[0].id for row in rows]
    next_occurrences = await get_next_occurrences_for_listing_ids(db, listing_ids)

    items: list[dict[str, Any]] = []
    for row in rows:
        listing, city, _venue, _wishlisted_at = row
        next_occurrence = next_occurrences.get(listing.id)
        gallery_image_urls = listing.gallery_image_urls if isinstance(listing.gallery_image_urls, list) else []
        if not gallery_image_urls and listing.cover_image_url:
            gallery_image_urls = [listing.cover_image_url]
        cover_image_url = listing.cover_image_url or (gallery_image_urls[0] if gallery_image_urls else None)

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
            "is_wishlisted": True,
            "distance_km": None,
            "next_occurrence": None,
        }

        if next_occurrence:
            item["next_occurrence"] = {
                "id": next_occurrence.id,
                "start_time": next_occurrence.start_time,
                "capacity_remaining": next_occurrence.capacity_remaining,
                "status": next_occurrence.status,
            }

        items.append(item)

    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.post("", response_model=MessageResponse)
async def add_to_wishlist(
    payload: WishlistCreateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_published_listing(db, listing_id=payload.listing_id):
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    created = await add_wishlist_item(
        db,
        user_id=current_user.id,
        listing_id=payload.listing_id,
    )
    if not created:
        return {"message": "Listing already in wishlist"}

    await on_wishlist_change(db, payload.listing_id)
    await db.commit()
    return {"message": "Added to wishlist"}


@router.delete("/{listing_id}", response_model=MessageResponse)
async def remove_from_wishlist(
    listing_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_published_listing(db, listing_id=listing_id):
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    removed = await remove_wishlist_item(
        db,
        user_id=current_user.id,
        listing_id=listing_id,
    )
    if not removed:
        return {"message": "Listing not present in wishlist"}

    await on_wishlist_change(db, listing_id)
    await db.commit()
    return {"message": "Removed from wishlist"}
