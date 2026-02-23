from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


async def commit(db: AsyncSession) -> None:
    await db.commit()
