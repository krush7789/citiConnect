from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import require_admin
from app.schema.common import MessageResponse
from app.services.popularity import recompute_popularity_for_all_listings

router = APIRouter(prefix="/admin/jobs", tags=["admin-jobs"])


@router.post("/recompute-popularity", response_model=MessageResponse)
async def recompute_popularity(_: object = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    count = await recompute_popularity_for_all_listings(db)
    await db.commit()
    return {"message": f"Popularity recomputed for {count} listings"}
