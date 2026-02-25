from __future__ import annotations
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.enums import ListingType
from app.repository import listings as listings_repository
from app.services.listing import format_listing_list_item
from app.utils.datetime_utils import to_end_of_day, to_start_of_day, utcnow
from app.utils.pagination import build_paginated_response
from app.utils.pricing import normalize_ticket_pricing
from app.utils.seat_layout import normalize_seat_layout, sort_seat_id_key

SORT_OPTIONS = {
    "newest",
    "price_asc",
    "price_desc",
    "date",
    "popularity",
    "distance",
    "relevance",
}


def parse_listing_types(raw: str | None) -> list[ListingType] | None:
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


def serialize_occurrence(occ, venue_name: str | None = None) -> dict[str, Any]:
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


async def get_listing_filters(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    types: str | None,
) -> dict[str, Any]:
    type_values = parse_listing_types(types)
    return await listings_repository.fetch_listing_filters_metadata(
        db,
        city_id=city_id,
        types=type_values,
    )


async def get_listings_page(
    db: AsyncSession,
    *,
    types: str | None,
    city_id: UUID | None,
    category: str | None,
    date_from: date | None,
    date_to: date | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
    q: str | None,
    is_featured: bool | None,
    sort: str,
    user_lat: float | None,
    user_lon: float | None,
    radius_km: float | None,
    page: int,
    page_size: int,
    current_user_id: UUID | None,
) -> dict[str, Any]:
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

    type_values = parse_listing_types(types)
    start_dt = to_start_of_day(date_from)
    end_dt = to_end_of_day(date_to)

    rows, total = await listings_repository.fetch_public_listings(
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
        user_id=current_user_id,
        user_lat=user_lat,
        user_lon=user_lon,
        radius_km=radius_km,
    )

    listing_ids = [row[0].id for row in rows]
    next_occurrences = await listings_repository.fetch_next_occurrences_for_listing_ids(
        db, listing_ids
    )
    items = [format_listing_list_item(row, next_occurrences) for row in rows]
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


async def get_listing_detail_by_id(
    db: AsyncSession, listing_id: UUID
) -> dict[str, Any]:
    record = await listings_repository.fetch_listing_record(db, listing_id)
    if not record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing, city, venue = record
    occurrences = await listings_repository.fetch_occurrences_for_listing(
        db, listing_id=listing_id, date_from=None, date_to=None
    )
    venue_name_map = await listings_repository.fetch_venue_name_map_for_occurrences(
        db, occurrences
    )
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
            serialize_occurrence(occ, venue_name_map.get(occ.venue_id))
            for occ in occurrences
        ],
    }


async def get_listing_occurrences_by_listing_id(
    db: AsyncSession,
    *,
    listing_id: UUID,
    date_from: date | None,
    date_to: date | None,
) -> dict[str, Any]:
    record = await listings_repository.fetch_listing_record(db, listing_id)
    if not record:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    occurrences = await listings_repository.fetch_occurrences_for_listing(
        db,
        listing_id=listing_id,
        date_from=to_start_of_day(date_from),
        date_to=to_end_of_day(date_to),
    )
    venue_name_map = await listings_repository.fetch_venue_name_map_for_occurrences(
        db, occurrences
    )
    return {
        "items": [
            serialize_occurrence(occ, venue_name_map.get(occ.venue_id))
            for occ in occurrences
        ]
    }


async def get_occurrence_seat_map(
    db: AsyncSession, occurrence_id: UUID
) -> dict[str, Any]:
    now = utcnow()
    expired_count = await listings_repository.expire_stale_locks(db, now=now)
    if expired_count:
        await listings_repository.commit(db)

    occurrence = await listings_repository.fetch_occurrence(db, occurrence_id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing_record = await listings_repository.fetch_listing_record(
        db, occurrence.listing_id
    )
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

    booked = await listings_repository.fetch_confirmed_booked_seats(db, occurrence.id)
    locked = await listings_repository.fetch_active_seat_locks(
        db, occurrence.id, now=now
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

