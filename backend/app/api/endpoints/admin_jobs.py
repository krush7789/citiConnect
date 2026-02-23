from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import require_admin
from app.schema.common import MessageResponse
from app.services.admin_jobs import recompute_popularity_job

router = APIRouter(prefix="/admin/jobs", tags=["admin-jobs"])


@router.post("/recompute-popularity", response_model=MessageResponse)
async def recompute_popularity(
    _: object = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await recompute_popularity_job(db)
