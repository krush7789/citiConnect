import re
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_optional_current_user
from app.core.errors import raise_api_error
from app.models.enums import ListingType, OccurrenceStatus
from app.repository.listing import (
    get_active_seat_locks,
    get_confirmed_booked_seats,
    get_filters_metadata,
    get_listing_by_id,
    get_next_occurrences_for_listing_ids,
    get_occurrence_by_id,
    list_listings,
    list_occurrences_for_listing,
)
from app.schema.common import PaginatedResponse
from app.schema.listing import (
    ListingDetailResponse,
    ListingFiltersResponse,
    ListingItem,
    ListingOccurrencesResponse,
    OccurrenceItem,
    SeatMapResponse,
)
from app.utils.pagination import total_pages

router = APIRouter(tags=["listings"])


SORT_OPTIONS = {"newest", "price_asc", "price_desc", "date", "popularity", "distance"}


def _parse_listing_types(raw: str | None) -> list[ListingType] | None:
    if not raw:
        return None

    values: list[ListingType] = []
    for item in raw.split(","):
        cleaned = item.strip().upper()
        if not cleaned:
            continue
        try:
            values.append(ListingType(cleaned))
        except ValueError:
            raise_api_error(422, "VALIDATION_ERROR", "Some fields are invalid", {"fields": {"types": f"Invalid listing type: {cleaned}"}})
    return values or None


def _to_start_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.min, tzinfo=UTC)


def _to_end_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.max, tzinfo=UTC)


def _sort_seat_id_key(seat_id: str):
    m = re.match(r"^([A-Za-z]+)(\d+)$", seat_id)
    if not m:
        return (seat_id, 0)
    return (m.group(1), int(m.group(2)))


def _serialize_occurrence(occ) -> dict[str, Any]:
    ticket_pricing = None
    if isinstance(occ.ticket_pricing, dict):
        ticket_pricing = {str(k): float(v) for k, v in occ.ticket_pricing.items()}

    return {
        "id": occ.id,
        "start_time": occ.start_time,
        "end_time": occ.end_time,
        "capacity_remaining": occ.capacity_remaining,
        "status": occ.status,
        "ticket_pricing": ticket_pricing,
    }


@router.get("/listings/filters", response_model=ListingFiltersResponse)
async def listing_filters(
    city_id: UUID | None = Query(default=None),
    types: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    type_values = _parse_listing_types(types)
    return await get_filters_metadata(db, city_id=city_id, types=type_values)


@router.get("/listings", response_model=PaginatedResponse[ListingItem])
async def get_listings(
    types: str | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    category: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    price_min: Decimal | None = Query(default=None),
    price_max: Decimal | None = Query(default=None),
    q: str | None = Query(default=None),
    is_featured: bool | None = Query(default=None),
    sort: str = Query(default="newest"),
    user_lat: float | None = Query(default=None),
    user_lon: float | None = Query(default=None),
    radius_km: float | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    if sort not in SORT_OPTIONS:
        raise_api_error(422, "VALIDATION_ERROR", "Some fields are invalid", {"fields": {"sort": "Invalid sort value"}})

    if sort == "distance" and (user_lat is None or user_lon is None):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"user_lat": "Required for distance sort", "user_lon": "Required for distance sort"}},
        )

    if radius_km is not None and (user_lat is None or user_lon is None):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"user_lat": "Required for radius filter", "user_lon": "Required for radius filter"}},
        )

    type_values = _parse_listing_types(types)
    start_dt = _to_start_of_day(date_from)
    end_dt = _to_end_of_day(date_to)

    rows, total = await list_listings(
        db,
        types=type_values,
        city_id=city_id,
        category=category,
        q=q,
        is_featured=is_featured,
        date_from=start_dt,
        date_to=end_dt,
        price_min=price_min,
        price_max=price_max,
        sort=sort,
        page=page,
        page_size=page_size,
        user_id=current_user.id if current_user else None,
        user_lat=user_lat,
        user_lon=user_lon,
        radius_km=radius_km,
    )

    listing_ids = [row[0].id for row in rows]
    next_occurrences = await get_next_occurrences_for_listing_ids(db, listing_ids)

    items: list[dict[str, Any]] = []
    for row in rows:
        listing, city, _venue, is_wishlisted, _next_start, *rest = row
        distance_km = float(rest[0]) if rest else None
        next_occurrence = next_occurrences.get(listing.id)

        item = {
            "id": listing.id,
            "type": listing.type,
            "title": listing.title,
            "category": listing.category,
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

        items.append(item)

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages(total, page_size),
    }


@router.get("/listings/{id}", response_model=ListingDetailResponse)
async def get_listing_detail(id: UUID, db: AsyncSession = Depends(get_db)):
    record = await get_listing_by_id(db, id)
    if not record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing, city, venue = record
    occurrences = await list_occurrences_for_listing(db, listing_id=id, date_from=None, date_to=None)

    return {
        "listing": {
            "id": listing.id,
            "type": listing.type,
            "title": listing.title,
            "description": listing.description,
            "city": {"id": city.id, "name": city.name, "state": city.state},
            "venue": {
                "id": venue.id,
                "name": venue.name,
                "address": venue.address,
                "latitude": venue.latitude,
                "longitude": venue.longitude,
            },
            "price_min": listing.price_min,
            "price_max": listing.price_max,
            "category": listing.category,
            "cover_image_url": listing.cover_image_url,
            "gallery_image_urls": listing.gallery_image_urls,
            "offer_text": listing.offer_text,
            "vibe_tags": listing.vibe_tags,
            "metadata": listing.metadata_json,
            "status": listing.status,
            "created_at": listing.created_at,
            "updated_at": listing.updated_at,
        },
        "occurrences": [_serialize_occurrence(occ) for occ in occurrences],
    }


@router.get("/listings/{id}/occurrences", response_model=ListingOccurrencesResponse)
async def get_listing_occurrences(
    id: UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    record = await get_listing_by_id(db, id)
    if not record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    occurrences = await list_occurrences_for_listing(
        db,
        listing_id=id,
        date_from=_to_start_of_day(date_from),
        date_to=_to_end_of_day(date_to),
    )

    return {"items": [_serialize_occurrence(occ) for occ in occurrences]}


@router.get("/occurrences/{id}/seats", response_model=SeatMapResponse)
async def get_occurrence_seats(id: UUID, db: AsyncSession = Depends(get_db)):
    occurrence = await get_occurrence_by_id(db, id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing_record = await get_listing_by_id(db, occurrence.listing_id)
    if not listing_record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing = listing_record[0]
    if listing.type != ListingType.MOVIE:
        raise_api_error(400, "INVALID_REQUEST", "Seat map is only available for movie occurrences")

    seat_layout = occurrence.seat_layout or {}
    version = int(seat_layout.get("version", 1))
    ticket_pricing = None
    if isinstance(occurrence.ticket_pricing, dict):
        ticket_pricing = {str(k): float(v) for k, v in occurrence.ticket_pricing.items()}

    rows = seat_layout.get("rows", []) if isinstance(seat_layout.get("rows", []), list) else []
    columns = seat_layout.get("columns", 0)

    seat_category_map = {}
    if isinstance(seat_layout.get("seat_category_map"), dict):
        seat_category_map = {str(k): v for k, v in seat_layout["seat_category_map"].items()}

    all_seats: set[str] = set(seat_category_map.keys())
    if rows and isinstance(columns, int) and columns > 0:
        for row_name in rows:
            for col in range(1, columns + 1):
                all_seats.add(f"{row_name}{col}")

    booked = await get_confirmed_booked_seats(db, occurrence.id)
    locked = await get_active_seat_locks(db, occurrence.id)
    all_seats.update(booked)
    all_seats.update(locked.keys())

    seat_states = []
    for seat_id in sorted(all_seats, key=_sort_seat_id_key):
        state = "AVAILABLE"
        if seat_id in booked:
            state = "BOOKED"
        elif seat_id in locked:
            state = "LOCKED"

        seat_states.append(
            {
                "seat_id": seat_id,
                "category": seat_category_map.get(seat_id),
                "state": state,
            }
        )

    return {
        "occurrence_id": occurrence.id,
        "version": version,
        "seat_layout": seat_layout,
        "seat_states": seat_states,
        "ticket_pricing": ticket_pricing,
    }
