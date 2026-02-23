from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.enums import ListingType
from app.models.offer import Offer
from app.repository.city import list_cities
from app.repository.master import list_offers_for_master
from app.repository.venue import list_venues
from app.services.geocoding import geocode_address
from app.utils.pagination import build_paginated_response


def _normalize_string_list(value: Any, *, uppercase: bool = False) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    for item in value:
        text = str(item).strip()
        if not text:
            continue
        normalized.append(text.upper() if uppercase else text)
    return normalized


def _offer_matches_scope(
    offer: Offer, *, city_id: UUID | None, listing_type: ListingType | None
) -> bool:
    applicability = offer.applicability if isinstance(offer.applicability, dict) else {}

    if city_id is not None:
        supported_city_ids = _normalize_string_list(applicability.get("city_ids"))
        if supported_city_ids and str(city_id) not in supported_city_ids:
            return False

    if listing_type is not None:
        supported_types = _normalize_string_list(
            applicability.get("types"), uppercase=True
        )
        if supported_types and listing_type.value.upper() not in supported_types:
            return False

    return True


def _serialize_offer_row(offer: Offer, *, now: datetime) -> dict[str, Any]:
    valid_from = offer.valid_from
    valid_until = offer.valid_until
    is_current = bool(
        offer.is_active
        and (valid_from is None or now >= valid_from)
        and (valid_until is None or now <= valid_until)
    )
    return {
        "id": offer.id,
        "code": offer.code,
        "title": offer.title,
        "description": offer.description,
        "discount_type": offer.discount_type.value,
        "discount_value": float(offer.discount_value),
        "min_order_value": float(offer.min_order_value)
        if offer.min_order_value is not None
        else None,
        "max_discount_value": float(offer.max_discount_value)
        if offer.max_discount_value is not None
        else None,
        "valid_from": offer.valid_from,
        "valid_until": offer.valid_until,
        "usage_limit": offer.usage_limit,
        "user_usage_limit": offer.user_usage_limit,
        "is_active": offer.is_active,
        "is_current": is_current,
        "applicability": offer.applicability
        if isinstance(offer.applicability, dict)
        else {},
    }


async def get_cities_page(
    db: AsyncSession,
    *,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    items, total = await list_cities(
        db, is_active=is_active, page=page, page_size=page_size
    )
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


async def get_venues_page(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    q: str | None,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    items, total = await list_venues(
        db,
        city_id=city_id,
        q=q,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


async def geocode_location_query(q: str) -> dict[str, float]:
    coordinates = await geocode_address(q)
    if not coordinates:
        raise_api_error(404, "NOT_FOUND", "Location not found")

    latitude, longitude = coordinates
    return {
        "latitude": latitude,
        "longitude": longitude,
    }


async def get_offers_page(
    db: AsyncSession,
    *,
    q: str | None,
    code: str | None,
    city_id: UUID | None,
    offer_type: ListingType | None,
    current_only: bool,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    now = datetime.now()
    code_query = code.strip() if code else None
    search_query = q.strip() if q else None
    rows = await list_offers_for_master(
        db,
        now=now,
        current_only=current_only,
        code_query=code_query,
        search_query=search_query,
    )
    filtered_rows = [
        row
        for row in rows
        if _offer_matches_scope(row, city_id=city_id, listing_type=offer_type)
    ]

    total = len(filtered_rows)
    start = (page - 1) * page_size
    items = [
        _serialize_offer_row(row, now=now)
        for row in filtered_rows[start : start + page_size]
    ]
    return build_paginated_response(items, page=page, page_size=page_size, total=total)

