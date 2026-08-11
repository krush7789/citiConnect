from fastapi import APIRouter

from app.api.endpoints.admin import router as admin_router
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.bookings import router as bookings_router
from app.api.endpoints.listings import router as listings_router
from app.api.endpoints.master import router as master_router
from app.api.endpoints.media import router as media_router
from app.api.endpoints.notifications import router as notifications_router
from app.api.endpoints.users import router as users_router
from app.api.endpoints.wishlists import router as wishlists_router

router = APIRouter(prefix="/api/v1")

for r in [
    auth_router,
    master_router,
    listings_router,
    bookings_router,
    wishlists_router,
    users_router,
    notifications_router,
    media_router,
    admin_router,
]:
    router.include_router(r)

v1_router = APIRouter(prefix="/v1")
for r in [
    auth_router,
    master_router,
    listings_router,
    bookings_router,
    wishlists_router,
    users_router,
    notifications_router,
    media_router,
    admin_router,
]:
    v1_router.include_router(r)
