from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.popularity import recompute_popularity_for_all_listings


async def recompute_popularity_job(db: AsyncSession) -> dict[str, str]:
    count = await recompute_popularity_for_all_listings(db)
    await db.commit()
    return {"message": f"Popularity recomputed for {count} listings"}
