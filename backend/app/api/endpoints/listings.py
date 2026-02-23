from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_optional_current_user
from app.schema.common import PaginatedResponse
from app.schema.listing import (
    ListingDetailResponse,
    ListingFiltersResponse,
    ListingItem,
    ListingOccurrencesResponse,
    SeatMapResponse,
)
from app.services.listings import (
    get_listing_detail_by_id,
    get_listing_filters,
    get_listing_occurrences_by_listing_id,
    get_listings_page,
    get_occurrence_seat_map,
)

router = APIRouter(tags=["listings"])


@router.get("/listings/filters", response_model=ListingFiltersResponse)
async def listing_filters(
    city_id: UUID | None = Query(default=None),
    types: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await get_listing_filters(db, city_id=city_id, types=types)


@router.get("/listings", response_model=PaginatedResponse[ListingItem])
async def get_listings(
    types: str | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    category: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    price_min: Decimal | None = Query(default=None),
    price_max: Decimal | None = Query(default=None),
    q: str | None = Query(default=None),
    is_featured: bool | None = Query(default=None),
    sort: str = Query(default="newest"),
    user_lat: float | None = Query(default=None),
    user_lon: float | None = Query(default=None),
    radius_km: float | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_listings_page(
        db,
        types=types,
        city_id=city_id,
        category=category,
        date_from=date_from,
        date_to=date_to,
        price_min=price_min,
        price_max=price_max,
        q=q,
        is_featured=is_featured,
        sort=sort,
        user_lat=user_lat,
        user_lon=user_lon,
        radius_km=radius_km,
        page=page,
        page_size=page_size,
        current_user_id=current_user.id if current_user else None,
    )


@router.get("/listings/{id}", response_model=ListingDetailResponse)
async def get_listing_detail(id: UUID, db: AsyncSession = Depends(get_db)):
    return await get_listing_detail_by_id(db, id)


@router.get("/listings/{id}/occurrences", response_model=ListingOccurrencesResponse)
async def get_listing_occurrences(
    id: UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await get_listing_occurrences_by_listing_id(
        db,
        listing_id=id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/occurrences/{id}/seats", response_model=SeatMapResponse)
async def get_occurrence_seats(id: UUID, db: AsyncSession = Depends(get_db)):
    return await get_occurrence_seat_map(db, id)
