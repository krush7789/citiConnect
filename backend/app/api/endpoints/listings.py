import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_optional_current_user
from app.core.errors import raise_api_error
from app.models.enums import ListingType
from app.models.venue import Venue
from app.repository.booking import expire_stale_seat_locks
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
    SeatMapResponse,
)
from app.utils.datetime_utils import to_end_of_day, to_start_of_day
from app.utils.pagination import build_paginated_response
from app.utils.pricing import normalize_ticket_pricing
from app.utils.seat_layout import normalize_seat_layout, sort_seat_id_key

router = APIRouter(tags=["listings"])


SORT_OPTIONS = {"newest", "price_asc", "price_desc", "date", "popularity", "distance", "relevance"}


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
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"types": f"Invalid listing type: {cleaned}"}},
            )
    return values or None


def _serialize_occurrence(occ, venue_name: str | None = None) -> dict[str, Any]:
    ticket_pricing = normalize_ticket_pricing(occ.ticket_pricing)

    return {
        "id": occ.id,
        "venue_id": occ.venue_id,
        "venue_name": venue_name,
        "start_time": occ.start_time,
        "end_time": occ.end_time,
        "provider_sub_location": occ.provider_sub_location,
        "capacity_total": occ.capacity_total,
        "capacity_remaining": occ.capacity_remaining,
        "status": occ.status,
        "ticket_pricing": ticket_pricing,
    }


async def _venue_name_map_for_occurrences(
    db: AsyncSession, occurrences: list[Any]
) -> dict[Any, str]:
    venue_ids = sorted(
        {occ.venue_id for occ in occurrences if getattr(occ, "venue_id", None)}
    )
    if not venue_ids:
        return {}

    rows = (
        await db.execute(select(Venue.id, Venue.name).where(Venue.id.in_(venue_ids)))
    ).all()
    return {row[0]: row[1] for row in rows}


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
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"sort": "Invalid sort value"}},
        )

    if sort == "distance" and (user_lat is None or user_lon is None):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {
                "fields": {
                    "user_lat": "Required for distance sort",
                    "user_lon": "Required for distance sort",
                }
            },
        )

    if radius_km is not None and (user_lat is None or user_lon is None):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {
                "fields": {
                    "user_lat": "Required for radius filter",
                    "user_lon": "Required for radius filter",
                }
            },
        )

    type_values = _parse_listing_types(types)
    start_dt = to_start_of_day(date_from)
    end_dt = to_end_of_day(date_to)

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

        items.append(item)

    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.get("/listings/{id}", response_model=ListingDetailResponse)
async def get_listing_detail(id: UUID, db: AsyncSession = Depends(get_db)):
    record = await get_listing_by_id(db, id)
    if not record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing, city, venue = record
    occurrences = await list_occurrences_for_listing(
        db, listing_id=id, date_from=None, date_to=None
    )
    venue_name_map = await _venue_name_map_for_occurrences(db, occurrences)
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
            "cover_image_url": cover_image_url,
            "gallery_image_urls": gallery_image_urls,
            "offer_text": listing.offer_text,
            "vibe_tags": listing.vibe_tags,
            "metadata": listing.metadata_json,
            "status": listing.status,
            "created_at": listing.created_at,
            "updated_at": listing.updated_at,
        },
        "occurrences": [
            _serialize_occurrence(occ, venue_name_map.get(occ.venue_id))
            for occ in occurrences
        ],
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
        date_from=to_start_of_day(date_from),
        date_to=to_end_of_day(date_to),
    )
    venue_name_map = await _venue_name_map_for_occurrences(db, occurrences)

    return {
        "items": [
            _serialize_occurrence(occ, venue_name_map.get(occ.venue_id))
            for occ in occurrences
        ]
    }


@router.get("/occurrences/{id}/seats", response_model=SeatMapResponse)
async def get_occurrence_seats(id: UUID, db: AsyncSession = Depends(get_db)):
    now = datetime.now(UTC)
    expired_count = await expire_stale_seat_locks(db, now=now)
    if expired_count:
        await db.commit()

    occurrence = await get_occurrence_by_id(db, id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing_record = await get_listing_by_id(db, occurrence.listing_id)
    if not listing_record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing = listing_record[0]
    if listing.type != ListingType.MOVIE:
        raise_api_error(
            400, "INVALID_REQUEST", "Seat map is only available for movie occurrences"
        )

    ticket_pricing = normalize_ticket_pricing(occurrence.ticket_pricing)
    default_category = (
        next(iter(ticket_pricing.keys()), None) if ticket_pricing else None
    )

    seat_layout = normalize_seat_layout(occurrence.seat_layout)

    # Still need to handle legacy dynamic DB state overlay on the layout logic
    legacy_states: dict[str, dict[str, str | None]] = {}
    if isinstance(occurrence.seat_layout, list):
        for item in occurrence.seat_layout:
            if not isinstance(item, dict):
                continue

            seat_id_value = item.get("id")
            seat_id = str(seat_id_value).strip() if seat_id_value is not None else ""
            if not seat_id:
                row_name = str(item.get("row") or "").strip()
                number = item.get("number")
                try:
                    column_num = int(number)
                    if not row_name or column_num <= 0:
                        continue
                    seat_id = f"{row_name}{column_num}"
                except (TypeError, ValueError):
                    continue

            category_value = item.get("category")
            category = (
                str(category_value).strip() if isinstance(category_value, str) else ""
            )

            # Dynamic lock state comes from SeatLock rows, not from static seat layout payload.
            legacy_states[seat_id] = {
                "state": "AVAILABLE",
                "category": category or default_category,
            }

    try:
        version = int(seat_layout.get("version", 1))
    except (TypeError, ValueError):
        version = 1

    rows_raw = seat_layout.get("rows", [])
    rows = (
        [row for row in rows_raw if isinstance(row, str)]
        if isinstance(rows_raw, list)
        else []
    )

    try:
        columns = int(seat_layout.get("columns", 0))
    except (TypeError, ValueError):
        columns = 0

    seat_category_map = {}
    if isinstance(seat_layout.get("seat_category_map"), dict):
        seat_category_map = {
            str(k): str(v)
            for k, v in seat_layout["seat_category_map"].items()
            if v is not None
        }

    all_seats: set[str] = set(seat_category_map.keys())
    all_seats.update(legacy_states.keys())
    if rows and isinstance(columns, int) and columns > 0:
        for row_name in rows:
            for col in range(1, columns + 1):
                all_seats.add(f"{row_name}{col}")

    booked, locked = await asyncio.gather(
        get_confirmed_booked_seats(db, occurrence.id),
        get_active_seat_locks(db, occurrence.id, now=now),
    )
    all_seats.update(booked)
    all_seats.update(locked.keys())

    seat_states = []
    for seat_id in sorted(all_seats, key=sort_seat_id_key):
        legacy_state = legacy_states.get(seat_id)
        state = legacy_state["state"] if legacy_state else "AVAILABLE"
        if seat_id in booked:
            state = "BOOKED"
        elif seat_id in locked:
            state = "LOCKED"

        seat_states.append(
            {
                "seat_id": seat_id,
                "category": seat_category_map.get(seat_id)
                or (legacy_state["category"] if legacy_state else default_category),
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
