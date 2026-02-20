from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.booking_idempotency import BookingIdempotency
from app.models.enums import BookingStatus, OccurrenceStatus, SeatLockStatus
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.offer import Offer
from app.models.seat_lock import SeatLock
from app.models.user_offer_usage import UserOfferUsage
from app.models.venue import Venue


async def expire_stale_holds(db: AsyncSession, now: datetime | None = None) -> int:
    reference = now or datetime.now(UTC)
    stmt = (
        update(Booking)
        .where(
            Booking.status == BookingStatus.HOLD,
            Booking.hold_expires_at.is_not(None),
            Booking.hold_expires_at <= reference,
        )
        .values(status=BookingStatus.EXPIRED)
    )
    result = await db.execute(stmt)
    return int(result.rowcount or 0)


async def expire_stale_seat_locks(db: AsyncSession, now: datetime | None = None) -> int:
    reference = now or datetime.now(UTC)
    stmt = (
        update(SeatLock)
        .where(
            SeatLock.status == SeatLockStatus.ACTIVE,
            SeatLock.expires_at <= reference,
        )
        .values(status=SeatLockStatus.EXPIRED)
    )
    result = await db.execute(stmt)
    return int(result.rowcount or 0)


async def get_occurrence(db: AsyncSession, occurrence_id: UUID, *, for_update: bool = False) -> Occurrence | None:
    stmt = select(Occurrence).where(Occurrence.id == occurrence_id)
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_listing(db: AsyncSession, listing_id: UUID) -> Listing | None:
    return (await db.execute(select(Listing).where(Listing.id == listing_id))).scalar_one_or_none()


async def get_venue(db: AsyncSession, venue_id: UUID) -> Venue | None:
    return (await db.execute(select(Venue).where(Venue.id == venue_id))).scalar_one_or_none()


async def get_booking(
    db: AsyncSession,
    booking_id: UUID,
    *,
    user_id: UUID | None = None,
    for_update: bool = False,
) -> Booking | None:
    stmt = select(Booking).where(Booking.id == booking_id)
    if user_id:
        stmt = stmt.where(Booking.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_user_active_hold_for_occurrence(
    db: AsyncSession,
    *,
    user_id: UUID,
    occurrence_id: UUID,
    now: datetime | None = None,
    for_update: bool = False,
) -> Booking | None:
    reference = now or datetime.now(UTC)
    stmt = (
        select(Booking)
        .where(
            Booking.user_id == user_id,
            Booking.occurrence_id == occurrence_id,
            Booking.status == BookingStatus.HOLD,
            Booking.hold_expires_at.is_not(None),
            Booking.hold_expires_at > reference,
        )
        .order_by(Booking.hold_expires_at.desc(), Booking.created_at.desc())
        .limit(1)
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_user_bookings(db: AsyncSession, *, user_id: UUID) -> list[Booking]:
    stmt = select(Booking).where(Booking.user_id == user_id).order_by(Booking.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


async def get_occurrences_by_ids(db: AsyncSession, occurrence_ids: list[UUID]) -> dict[UUID, Occurrence]:
    if not occurrence_ids:
        return {}
    stmt = select(Occurrence).where(Occurrence.id.in_(occurrence_ids))
    rows = (await db.execute(stmt)).scalars().all()
    return {row.id: row for row in rows}


async def get_offer_by_code(db: AsyncSession, code: str) -> Offer | None:
    stmt = select(Offer).where(func.lower(Offer.code) == code.lower()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_offer_by_id(db: AsyncSession, offer_id: UUID) -> Offer | None:
    return (await db.execute(select(Offer).where(Offer.id == offer_id))).scalar_one_or_none()


async def count_offer_usage(db: AsyncSession, offer_id: UUID, *, user_id: UUID | None = None) -> int:
    stmt = select(func.count(UserOfferUsage.id)).where(UserOfferUsage.offer_id == offer_id)
    if user_id:
        stmt = stmt.where(UserOfferUsage.user_id == user_id)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def get_booking_idempotency(db: AsyncSession, key: str) -> BookingIdempotency | None:
    stmt = select(BookingIdempotency).where(BookingIdempotency.key == key).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_active_locks_for_seats(
    db: AsyncSession,
    *,
    occurrence_id: UUID,
    seat_ids: list[str],
    now: datetime | None = None,
    for_update: bool = False,
) -> list[SeatLock]:
    if not seat_ids:
        return []

    reference = now or datetime.now(UTC)
    stmt = select(SeatLock).where(
        SeatLock.occurrence_id == occurrence_id,
        SeatLock.seat_id.in_(seat_ids),
        SeatLock.status == SeatLockStatus.ACTIVE,
        SeatLock.expires_at > reference,
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalars().all()


async def get_user_active_locks_for_occurrence(
    db: AsyncSession,
    *,
    occurrence_id: UUID,
    user_id: UUID,
    now: datetime | None = None,
    for_update: bool = False,
) -> list[SeatLock]:
    reference = now or datetime.now(UTC)
    stmt = select(SeatLock).where(
        SeatLock.occurrence_id == occurrence_id,
        SeatLock.user_id == user_id,
        SeatLock.status == SeatLockStatus.ACTIVE,
        SeatLock.expires_at > reference,
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalars().all()


async def get_confirmed_bookings_for_occurrence(db: AsyncSession, occurrence_id: UUID) -> list[Booking]:
    stmt = select(Booking).where(
        Booking.occurrence_id == occurrence_id,
        Booking.status == BookingStatus.CONFIRMED,
        Booking.booked_seats.is_not(None),
    )
    return (await db.execute(stmt)).scalars().all()


async def restore_capacity_for_failed_bookings(db: AsyncSession) -> int:
    failed_occurrence_ids = (
        (
            await db.execute(
                select(Booking.occurrence_id)
                .where(Booking.status == BookingStatus.FAILED)
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    if not failed_occurrence_ids:
        return 0

    confirmed_rows = await db.execute(
        select(Booking.occurrence_id, func.coalesce(func.sum(Booking.quantity), 0))
        .where(
            Booking.occurrence_id.in_(failed_occurrence_ids),
            Booking.status == BookingStatus.CONFIRMED,
        )
        .group_by(Booking.occurrence_id)
    )
    confirmed_quantity_by_occurrence = {
        occurrence_id: int(quantity or 0)
        for occurrence_id, quantity in confirmed_rows.all()
    }

    occurrences = (
        (
            await db.execute(
                select(Occurrence)
                .where(Occurrence.id.in_(failed_occurrence_ids))
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )

    changed = 0
    for occurrence in occurrences:
        confirmed_quantity = confirmed_quantity_by_occurrence.get(occurrence.id, 0)
        expected_remaining = max(0, int(occurrence.capacity_total or 0) - confirmed_quantity)

        capacity_changed = occurrence.capacity_remaining != expected_remaining
        if capacity_changed:
            occurrence.capacity_remaining = expected_remaining

        status_changed = False
        if occurrence.status not in {OccurrenceStatus.CANCELLED, OccurrenceStatus.ARCHIVED}:
            expected_status = OccurrenceStatus.SOLD_OUT if expected_remaining == 0 else OccurrenceStatus.SCHEDULED
            if occurrence.status != expected_status:
                occurrence.status = expected_status
                status_changed = True

        if capacity_changed or status_changed:
            changed += 1

    return changed
