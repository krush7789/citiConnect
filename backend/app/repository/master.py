from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.offer import Offer


async def list_offers_for_master(
    db: AsyncSession,
    *,
    now: datetime,
    current_only: bool,
    code_query: str | None,
    search_query: str | None,
) -> list[Offer]:
    stmt = select(Offer)

    if current_only:
        stmt = stmt.where(Offer.is_active.is_(True))
        stmt = stmt.where(or_(Offer.valid_from.is_(None), Offer.valid_from <= now))
        stmt = stmt.where(or_(Offer.valid_until.is_(None), Offer.valid_until >= now))

    if code_query:
        stmt = stmt.where(Offer.code.ilike(f"%{code_query}%"))

    if search_query:
        query = f"%{search_query}%"
        stmt = stmt.where(
            or_(
                Offer.code.ilike(query),
                Offer.title.ilike(query),
                Offer.description.ilike(query),
            )
        )

    stmt = stmt.order_by(Offer.valid_until.asc().nulls_last(), Offer.created_at.desc())
    return (await db.execute(stmt)).scalars().all()
