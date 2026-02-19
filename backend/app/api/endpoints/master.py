from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import raise_api_error
from app.repository.city import list_cities
from app.repository.venue import list_venues
from app.schema.common import GeocodeResponse, PaginatedResponse
from app.schema.city import CityItem
from app.schema.venue import VenueItem
from app.services.geocoding import geocode_address
from app.utils.pagination import total_pages

router = APIRouter(tags=["master"])


@router.get("/cities", response_model=PaginatedResponse[CityItem])
async def get_cities(
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_cities(db, is_active=is_active, page=page, page_size=page_size)
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages(total, page_size),
    }


@router.get("/venues", response_model=PaginatedResponse[VenueItem])
async def get_venues(
    city_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_venues(
        db,
        city_id=city_id,
        q=q,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages(total, page_size),
    }


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode_location(q: str = Query(min_length=3, max_length=300)):
    coordinates = await geocode_address(q)
    if not coordinates:
        raise_api_error(404, "NOT_FOUND", "Location not found")

    latitude, longitude = coordinates
    return {
        "latitude": latitude,
        "longitude": longitude,
    }
