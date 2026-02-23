from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ListingType
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.seat_lock import SeatLock
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


async def fetch_listing_filters_metadata(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    types: list[ListingType] | None,
) -> dict:
    return await get_filters_metadata(db, city_id=city_id, types=types)


async def fetch_public_listings(
    db: AsyncSession,
    *,
    types: list[ListingType] | None,
    city_id: UUID | None,
    category: str | None,
    q: str | None,
    is_featured: bool | None,
    date_from: datetime | None,
    date_to: datetime | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
    sort: str,
    page: int,
    page_size: int,
    user_id: UUID | None,
    user_lat: float | None,
    user_lon: float | None,
    radius_km: float | None,
):
    return await list_listings(
        db,
        types=types,
        city_id=city_id,
        category=category,
        q=q,
        is_featured=is_featured,
        date_from=date_from,
        date_to=date_to,
        price_min=price_min,
        price_max=price_max,
        sort=sort,
        page=page,
        page_size=page_size,
        user_id=user_id,
        user_lat=user_lat,
        user_lon=user_lon,
        radius_km=radius_km,
    )


async def fetch_next_occurrences_for_listing_ids(
    db: AsyncSession, listing_ids: list[UUID]
) -> dict[UUID, Occurrence]:
    return await get_next_occurrences_for_listing_ids(db, listing_ids)


async def fetch_listing_record(
    db: AsyncSession, listing_id: UUID
) -> tuple[Listing, object, Venue] | None:
    return await get_listing_by_id(db, listing_id)


async def fetch_occurrences_for_listing(
    db: AsyncSession,
    *,
    listing_id: UUID,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[Occurrence]:
    return await list_occurrences_for_listing(
        db,
        listing_id=listing_id,
        date_from=date_from,
        date_to=date_to,
    )


async def fetch_venue_name_map_for_occurrences(
    db: AsyncSession, occurrences: list[Occurrence]
) -> dict[UUID, str]:
    venue_ids = sorted(
        {occ.venue_id for occ in occurrences if getattr(occ, "venue_id", None)}
    )
    if not venue_ids:
        return {}
    rows = (
        await db.execute(select(Venue.id, Venue.name).where(Venue.id.in_(venue_ids)))
    ).all()
    return {row[0]: row[1] for row in rows}


async def expire_stale_locks(db: AsyncSession, *, now: datetime | None = None) -> int:
    reference = now or datetime.now()
    return await expire_stale_seat_locks(db, now=reference)


async def fetch_occurrence(db: AsyncSession, occurrence_id: UUID) -> Occurrence | None:
    return await get_occurrence_by_id(db, occurrence_id)


async def fetch_confirmed_booked_seats(
    db: AsyncSession, occurrence_id: UUID
) -> set[str]:
    return await get_confirmed_booked_seats(db, occurrence_id)


async def fetch_active_seat_locks(
    db: AsyncSession,
    occurrence_id: UUID,
    *,
    now: datetime | None = None,
) -> dict[str, SeatLock]:
    reference = now or datetime.now()
    return await get_active_seat_locks(db, occurrence_id, now=reference)


async def commit(db: AsyncSession) -> None:
    await db.commit()

