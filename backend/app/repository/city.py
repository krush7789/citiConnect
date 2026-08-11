from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.city import City


async def list_cities(
    db: AsyncSession,
    *,
    q: str | None,
    state: str | None,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> tuple[list[City], int]:
    stmt: Select[tuple[City]] = select(City)
    count_stmt = select(func.count(City.id))

    if q:
        q_like = f"%{q.strip()}%"
        stmt = stmt.where(City.name.ilike(q_like))
        count_stmt = count_stmt.where(City.name.ilike(q_like))

    if state:
        normalized_state = state.strip().lower()
        stmt = stmt.where(func.lower(City.state) == normalized_state)
        count_stmt = count_stmt.where(func.lower(City.state) == normalized_state)

    if is_active is not None:
        stmt = stmt.where(City.is_active == is_active)
        count_stmt = count_stmt.where(City.is_active == is_active)

    stmt = (
        stmt.order_by(City.name.asc()).offset((page - 1) * page_size).limit(page_size)
    )
    total = (await db.execute(count_stmt)).scalar_one()
    items = (await db.execute(stmt)).scalars().all()
    return items, total
