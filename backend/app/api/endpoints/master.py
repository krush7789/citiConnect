from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import ListingType
from app.schema.common import GeocodeResponse, PaginatedResponse
from app.schema.city import CityItem
from app.schema.offer import OfferItem
from app.schema.venue import VenueItem
from app.services.master import (
    geocode_location_query,
    get_cities_page,
    get_offers_page,
    get_venues_page,
)

router = APIRouter(tags=["master"])


@router.get("/cities", response_model=PaginatedResponse[CityItem])
async def get_cities(
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_cities_page(
        db,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )


@router.get("/venues", response_model=PaginatedResponse[VenueItem])
async def get_venues(
    city_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_venues_page(
        db,
        city_id=city_id,
        q=q,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode_location(q: str = Query(min_length=3, max_length=300)):
    return await geocode_location_query(q)


@router.get("/offers", response_model=PaginatedResponse[OfferItem])
async def get_offers(
    q: str | None = Query(default=None),
    code: str | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    offer_type: ListingType | None = Query(default=None, alias="type"),
    current_only: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_offers_page(
        db,
        q=q,
        code=code,
        city_id=city_id,
        offer_type=offer_type,
        current_only=current_only,
        page=page,
        page_size=page_size,
    )
