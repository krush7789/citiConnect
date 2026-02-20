from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import raise_api_error
from app.models.enums import ListingType
from app.models.offer import Offer
from app.repository.city import list_cities
from app.repository.venue import list_venues
from app.schema.common import GeocodeResponse, PaginatedResponse
from app.schema.city import CityItem
from app.schema.offer import OfferItem
from app.schema.venue import VenueItem
from app.services.geocoding import geocode_address
from app.utils.pagination import build_paginated_response

router = APIRouter(tags=["master"])


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


def _offer_matches_scope(offer: Offer, *, city_id: UUID | None, listing_type: ListingType | None) -> bool:
    applicability = offer.applicability if isinstance(offer.applicability, dict) else {}

    if city_id is not None:
        supported_city_ids = _normalize_string_list(applicability.get("city_ids"))
        if supported_city_ids and str(city_id) not in supported_city_ids:
            return False

    if listing_type is not None:
        supported_types = _normalize_string_list(applicability.get("types"), uppercase=True)
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
        "min_order_value": float(offer.min_order_value) if offer.min_order_value is not None else None,
        "max_discount_value": float(offer.max_discount_value) if offer.max_discount_value is not None else None,
        "valid_from": offer.valid_from,
        "valid_until": offer.valid_until,
        "usage_limit": offer.usage_limit,
        "user_usage_limit": offer.user_usage_limit,
        "is_active": offer.is_active,
        "is_current": is_current,
        "applicability": offer.applicability if isinstance(offer.applicability, dict) else {},
    }


@router.get("/cities", response_model=PaginatedResponse[CityItem])
async def get_cities(
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_cities(db, is_active=is_active, page=page, page_size=page_size)
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.get("/venues", response_model=PaginatedResponse[VenueItem])
async def get_venues(
    city_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_venues(
        db,
        city_id=city_id,
        q=q,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode_location(q: str = Query(min_length=3, max_length=300)):
    coordinates = await geocode_address(q)
    if not coordinates:
        raise_api_error(404, "NOT_FOUND", "Location not found")

    latitude, longitude = coordinates
    return {
        "latitude": latitude,
        "longitude": longitude,
    }


@router.get("/offers", response_model=PaginatedResponse[OfferItem])
async def get_offers(
    q: str | None = Query(default=None),
    code: str | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    offer_type: ListingType | None = Query(default=None, alias="type"),
    current_only: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    stmt = select(Offer)

    if current_only:
        stmt = stmt.where(Offer.is_active.is_(True))
        stmt = stmt.where(or_(Offer.valid_from.is_(None), Offer.valid_from <= now))
        stmt = stmt.where(or_(Offer.valid_until.is_(None), Offer.valid_until >= now))

    if code:
        code_query = f"%{code.strip()}%"
        stmt = stmt.where(Offer.code.ilike(code_query))

    if q:
        query = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Offer.code.ilike(query),
                Offer.title.ilike(query),
                Offer.description.ilike(query),
            )
        )

    stmt = stmt.order_by(Offer.valid_until.asc().nulls_last(), Offer.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    filtered_rows = [
        row for row in rows if _offer_matches_scope(row, city_id=city_id, listing_type=offer_type)
    ]

    total = len(filtered_rows)
    start = (page - 1) * page_size
    items = [_serialize_offer_row(row, now=now) for row in filtered_rows[start : start + page_size]]

    return build_paginated_response(items, page=page, page_size=page_size, total=total)
