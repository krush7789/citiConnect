from uuid import UUID

from datetime import datetime

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.city import City
from app.models.enums import ListingStatus, OccurrenceStatus
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.venue import Venue
from app.models.wishlist import Wishlist


async def list_user_wishlist(
    db: AsyncSession,
    *,
    user_id: UUID,
    page: int,
    page_size: int,
):
    now = datetime.now()
    active_occurrence_exists = exists(
        select(Occurrence.id).where(
            Occurrence.listing_id == Listing.id,
            Occurrence.status == OccurrenceStatus.SCHEDULED,
            or_(
                Occurrence.end_time >= now,
                (Occurrence.end_time.is_(None) & (Occurrence.start_time >= now)),
            ),
        )
    )

    stmt = (
        select(Listing, City, Venue, Wishlist.created_at)
        .join(Wishlist, Wishlist.listing_id == Listing.id)
        .join(City, City.id == Listing.city_id)
        .join(Venue, Venue.id == Listing.venue_id)
        .where(
            Wishlist.user_id == user_id,
            Listing.status == ListingStatus.PUBLISHED,
            active_occurrence_exists,
        )
        .order_by(Wishlist.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    count_stmt = (
        select(func.count(Wishlist.id))
        .join(Listing, Listing.id == Wishlist.listing_id)
        .where(
            Wishlist.user_id == user_id,
            Listing.status == ListingStatus.PUBLISHED,
            active_occurrence_exists,
        )
    )

    rows = (await db.execute(stmt)).all()
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    return rows, total


async def is_published_listing(db: AsyncSession, *, listing_id: UUID) -> bool:
    now = datetime.now()
    active_occurrence_exists = exists(
        select(Occurrence.id).where(
            Occurrence.listing_id == Listing.id,
            Occurrence.status == OccurrenceStatus.SCHEDULED,
            or_(
                Occurrence.end_time >= now,
                (Occurrence.end_time.is_(None) & (Occurrence.start_time >= now)),
            ),
        )
    )

    stmt = (
        select(Listing.id)
        .where(
            Listing.id == listing_id,
            Listing.status == ListingStatus.PUBLISHED,
            active_occurrence_exists,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def add_wishlist_item(
    db: AsyncSession, *, user_id: UUID, listing_id: UUID
) -> bool:
    existing = (
        await db.execute(
            select(Wishlist.id).where(
                Wishlist.user_id == user_id,
                Wishlist.listing_id == listing_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return False

    item = Wishlist(user_id=user_id, listing_id=listing_id)
    db.add(item)
    await db.flush()
    return True


async def remove_wishlist_item(
    db: AsyncSession, *, user_id: UUID, listing_id: UUID
) -> bool:
    wishlist_item = (
        await db.execute(
            select(Wishlist).where(
                Wishlist.user_id == user_id,
                Wishlist.listing_id == listing_id,
            )
        )
    ).scalar_one_or_none()

    if not wishlist_item:
        return False

    await db.delete(wishlist_item)
    await db.flush()
    return True

