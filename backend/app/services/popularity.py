import math
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.enums import BookingStatus
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.wishlist import Wishlist


async def _booking_units_for_listing(db: AsyncSession, listing_id: UUID) -> float:
    age_days = func.extract("epoch", func.now() - Booking.created_at) / 86400.0
    decayed = func.sum(Booking.quantity * func.exp(-(age_days / 30.0)))

    stmt = (
        select(func.coalesce(decayed, 0.0))
        .join(Occurrence, Occurrence.id == Booking.occurrence_id)
        .where(Occurrence.listing_id == listing_id, Booking.status == BookingStatus.CONFIRMED)
    )
    value = (await db.execute(stmt)).scalar_one()
    return float(value or 0.0)


async def _wishlist_count_for_listing(db: AsyncSession, listing_id: UUID) -> int:
    stmt = select(func.count(Wishlist.id)).where(Wishlist.listing_id == listing_id)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def recompute_popularity_for_listing(db: AsyncSession, listing_id: UUID) -> float:
    booking_units = await _booking_units_for_listing(db, listing_id)
    wishlist_count = await _wishlist_count_for_listing(db, listing_id)
    wishlist_units = math.log1p(wishlist_count)

    score = round((0.85 * booking_units) + (0.15 * wishlist_units), 6)

    listing = await db.get(Listing, listing_id)
    if listing:
        listing.popularity_score = score
        await db.flush()
    return score


async def recompute_popularity_by_occurrence(db: AsyncSession, occurrence_id: UUID) -> float | None:
    occurrence = await db.get(Occurrence, occurrence_id)
    if not occurrence:
        return None
    return await recompute_popularity_for_listing(db, occurrence.listing_id)


async def recompute_popularity_for_all_listings(db: AsyncSession) -> int:
    listing_ids = (await db.execute(select(Listing.id))).scalars().all()
    for listing_id in listing_ids:
        await recompute_popularity_for_listing(db, listing_id)
    return len(listing_ids)


async def on_booking_state_change(db: AsyncSession, occurrence_id: UUID) -> float | None:
    return await recompute_popularity_by_occurrence(db, occurrence_id)


async def on_wishlist_change(db: AsyncSession, listing_id: UUID) -> float:
    return await recompute_popularity_for_listing(db, listing_id)
