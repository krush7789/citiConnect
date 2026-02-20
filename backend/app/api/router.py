from fastapi import APIRouter

from app.api.endpoints.admin import router as admin_router
from app.api.endpoints.admin_jobs import router as admin_jobs_router
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.bookings import router as bookings_router
from app.api.endpoints.listings import router as listings_router
from app.api.endpoints.master import router as master_router
from app.api.endpoints.media import router as media_router
from app.api.endpoints.notifications import router as notifications_router
from app.api.endpoints.users import router as users_router
from app.api.endpoints.wishlists import router as wishlists_router

router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(master_router)
router.include_router(listings_router)
router.include_router(bookings_router)
router.include_router(wishlists_router)
router.include_router(users_router)
router.include_router(notifications_router)
router.include_router(media_router)
router.include_router(admin_router)
router.include_router(admin_jobs_router)


@router.get("/")
async def api_root():
    return {"message": "CitiConnect API v1"}
