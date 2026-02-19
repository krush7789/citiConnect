from fastapi import APIRouter

from app.api.endpoints.admin_jobs import router as admin_jobs_router
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.listings import router as listings_router
from app.api.endpoints.master import router as master_router

router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(master_router)
router.include_router(listings_router)
router.include_router(admin_jobs_router)


@router.get("/")
async def api_root():
    return {"message": "CitiConnect API v1"}
