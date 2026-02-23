from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.schema.user import UpdateMeRequest, UserMeResponse
from app.services.users import get_me_profile, update_me_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_me_profile(db, current_user)


@router.patch("/me", response_model=UserMeResponse)
async def update_me(
    payload: UpdateMeRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_me_profile(
        db,
        payload=payload,
        current_user=current_user,
    )
