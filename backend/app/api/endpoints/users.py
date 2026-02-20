from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.models.booking import Booking
from app.models.enums import BookingStatus
from app.models.occurrence import Occurrence
from app.models.user import User
from app.schema.user import UpdateMeRequest, UserMeResponse

router = APIRouter(prefix="/users", tags=["users"])


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def _user_stats(db: AsyncSession, user_id) -> dict[str, Any]:
    now = datetime.now(UTC)
    total_bookings = int(
        (await db.execute(select(func.count(Booking.id)).where(Booking.user_id == user_id))).scalar_one() or 0
    )
    upcoming_bookings = int(
        (
            await db.execute(
                select(func.count(Booking.id))
                .join(Occurrence, Occurrence.id == Booking.occurrence_id)
                .where(
                    Booking.user_id == user_id,
                    Booking.status == BookingStatus.CONFIRMED,
                    or_(
                        Occurrence.end_time >= now,
                        (Occurrence.end_time.is_(None) & (Occurrence.start_time >= now)),
                    ),
                )
            )
        ).scalar_one()
        or 0
    )
    total_spent = (
        (
            await db.execute(
                select(func.coalesce(func.sum(Booking.final_price), 0)).where(
                    Booking.user_id == user_id,
                    Booking.status == BookingStatus.CONFIRMED,
                )
            )
        ).scalar_one()
        or Decimal("0")
    )

    return {
        "total_bookings": total_bookings,
        "upcoming_bookings": upcoming_bookings,
        "total_spent": float(total_spent),
    }


async def _serialize_user(db: AsyncSession, user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "profile_image_url": user.profile_image_url,
        "role": user.role.value,
        "is_active": bool(user.is_active),
        "is_temporary_password": bool(user.is_temporary_password),
        "stats": await _user_stats(db, user.id),
    }


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return {"user": await _serialize_user(db, current_user)}


@router.patch("/me", response_model=UserMeResponse)
async def update_me(
    payload: UpdateMeRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"name": "Name cannot be empty"}},
            )
        current_user.name = cleaned_name

    if payload.phone is not None:
        cleaned_phone = _normalize_optional_text(payload.phone)
        if cleaned_phone:
            duplicate = (
                await db.execute(
                    select(User.id).where(
                        User.phone == cleaned_phone,
                        User.id != current_user.id,
                    )
                )
            ).scalar_one_or_none()
            if duplicate:
                raise_api_error(
                    409,
                    "DUPLICATE_PHONE",
                    "Phone number is already used by another account",
                )
        current_user.phone = cleaned_phone

    if payload.profile_image_url is not None:
        current_user.profile_image_url = _normalize_optional_text(payload.profile_image_url)

    await db.commit()
    await db.refresh(current_user)
    return {"user": await _serialize_user(db, current_user)}
