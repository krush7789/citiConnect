from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue import Venue


async def list_venues(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    q: str | None,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> tuple[list[Venue], int]:
    stmt: Select[tuple[Venue]] = select(Venue)
    count_stmt = select(func.count(Venue.id))

    if city_id:
        stmt = stmt.where(Venue.city_id == city_id)
        count_stmt = count_stmt.where(Venue.city_id == city_id)

    if is_active is not None:
        stmt = stmt.where(Venue.is_active == is_active)
        count_stmt = count_stmt.where(Venue.is_active == is_active)

    if q:
        q_like = f"%{q.strip()}%"
        stmt = stmt.where(Venue.name.ilike(q_like))
        count_stmt = count_stmt.where(Venue.name.ilike(q_like))

    stmt = stmt.order_by(Venue.name.asc()).offset((page - 1) * page_size).limit(page_size)
    total = (await db.execute(count_stmt)).scalar_one()
    items = (await db.execute(stmt)).scalars().all()
    return items, total
