from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


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

