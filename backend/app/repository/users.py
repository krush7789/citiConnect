from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.enums import BookingStatus
from app.models.occurrence import Occurrence
from app.models.user import User
from app.utils.datetime_utils import utcnow


async def count_total_bookings(db: AsyncSession, user_id: UUID) -> int:
    return int(
        (
            await db.execute(select(func.count(Booking.id)).where(Booking.user_id == user_id))
        ).scalar_one()
        or 0
    )


async def count_upcoming_confirmed_bookings(
    db: AsyncSession, user_id: UUID, now: datetime | None = None
) -> int:
    reference = now or utcnow()
    return int(
        (
            await db.execute(
                select(func.count(Booking.id))
                .join(Occurrence, Occurrence.id == Booking.occurrence_id)
                .where(
                    Booking.user_id == user_id,
                    Booking.status == BookingStatus.CONFIRMED,
                    or_(
                        Occurrence.end_time >= reference,
                        (
                            Occurrence.end_time.is_(None)
                            & (Occurrence.start_time >= reference)
                        ),
                    ),
                )
            )
        ).scalar_one()
        or 0
    )


async def sum_confirmed_total_spent(db: AsyncSession, user_id: UUID) -> Decimal:
    return (
        await db.execute(
            select(func.coalesce(func.sum(Booking.final_price), 0)).where(
                Booking.user_id == user_id,
                Booking.status == BookingStatus.CONFIRMED,
            )
        )
    ).scalar_one() or Decimal("0")


async def find_user_id_by_phone_excluding_user(
    db: AsyncSession,
    *,
    phone: str,
    excluded_user_id: UUID,
) -> UUID | None:
    return (
        await db.execute(
            select(User.id).where(
                User.phone == phone,
                User.id != excluded_user_id,
            )
        )
    ).scalar_one_or_none()


async def commit(db: AsyncSession) -> None:
    await db.commit()


async def refresh_user(db: AsyncSession, user: User) -> None:
    await db.refresh(user)

