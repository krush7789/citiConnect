from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import require_admin
from app.models.enums import ListingType
from app.schema.admin import (
    AdminAuditLogItem,
    AdminBookingItem,
    AdminCityMutationResponse,
    AdminDashboardDrillResponse,
    AdminDashboardResponse,
    AdminListingCreateResponse,
    AdminListingDetailResponse,
    AdminListingListItem,
    AdminListingUpdateResponse,
    AdminOccurrenceCancelResponse,
    AdminOccurrenceCreateResponse,
    AdminOccurrenceItem,
    AdminOccurrenceUpdateResponse,
    AdminOfferItem,
    AdminOfferMutationResponse,
    AdminVenueCreateResponse,
    CityCreateRequest,
    CityUpdateRequest,
    ListingCreateRequest,
    ListingUpdateRequest,
    OccurrenceCancelRequest,
    OccurrenceCreateRequest,
    OccurrenceUpdateRequest,
    OfferCreateRequest,
    OfferUpdateRequest,
    VenueCreateRequest,
    VenueUpdateRequest,
)
from app.schema.common import MessageResponse, PaginatedResponse
from app.services.admin import (
    archive_admin_listing_entry,
    cancel_admin_occurrence_entry,
    create_admin_city_entry,
    create_admin_listing_entry,
    create_admin_occurrence_entries,
    create_admin_offer_entry,
    create_admin_venue_entry,
    get_admin_audit_logs_page,
    get_admin_bookings_page,
    get_admin_dashboard,
    get_admin_dashboard_drill_page,
    get_admin_listing_detail,
    get_admin_listings_page,
    get_admin_occurrences_page,
    get_admin_offers_page,
    update_admin_listing_entry,
    update_admin_city_entry,
    update_admin_occurrence_entry,
    update_admin_offer_entry,
    update_admin_venue_entry,
    soft_delete_admin_venue_entry,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def get_dashboard(
    preset: Literal["7d", "30d", "90d", "mtd", "custom"] = Query(default="30d"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    listing_type: ListingType | None = Query(default=None),
    interval: Literal["day", "week", "month"] | None = Query(default=None),
    source_dimension: Literal[
        "category",
        "listing_type",
        "city",
        "payment_provider",
        "offer_code",
    ] = Query(default="category"),
    top_n: int = Query(default=8, ge=1, le=25),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_dashboard(
        db,
        preset=preset,
        date_from=date_from,
        date_to=date_to,
        city_id=city_id,
        listing_type=listing_type,
        interval=interval,
        source_dimension=source_dimension,
        top_n=top_n,
    )


@router.get("/dashboard/drill", response_model=AdminDashboardDrillResponse)
async def get_dashboard_drill(
    metric: Literal[
        "revenue_sources",
        "usage_by_region",
        "event_attendance",
        "new_users",
    ] = Query(),
    preset: Literal["7d", "30d", "90d", "mtd", "custom"] = Query(default="30d"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    city_id: UUID | None = Query(default=None),
    listing_type: ListingType | None = Query(default=None),
    interval: Literal["day", "week", "month"] | None = Query(default=None),
    source_dimension: Literal[
        "category",
        "listing_type",
        "city",
        "payment_provider",
        "offer_code",
    ] = Query(default="category"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    sort_by: str | None = Query(default=None),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    q: str | None = Query(default=None),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_dashboard_drill_page(
        db,
        metric=metric,
        preset=preset,
        date_from=date_from,
        date_to=date_to,
        city_id=city_id,
        listing_type=listing_type,
        interval=interval,
        source_dimension=source_dimension,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
        q=q,
    )


@router.get("/listings", response_model=PaginatedResponse[AdminListingListItem])
async def get_admin_listings(
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    city: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_listings_page(
        db,
        type=type,
        status=status,
        city=city,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.get("/listings/{listing_id}", response_model=AdminListingDetailResponse)
async def get_admin_listing_by_id(
    listing_id: UUID,
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_listing_detail(db, listing_id)


@router.post("/listings", response_model=AdminListingCreateResponse)
async def create_admin_listing(
    payload: ListingCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_listing_entry(
        db,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch("/listings/{listing_id}", response_model=AdminListingUpdateResponse)
async def update_admin_listing(
    listing_id: UUID,
    payload: ListingUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_admin_listing_entry(
        db,
        listing_id=listing_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.delete("/listings/{listing_id}", response_model=MessageResponse)
async def archive_admin_listing(
    listing_id: UUID,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await archive_admin_listing_entry(
        db,
        listing_id=listing_id,
        admin_user_id=admin_user.id,
    )


@router.get(
    "/listings/{listing_id}/occurrences",
    response_model=PaginatedResponse[AdminOccurrenceItem],
)
async def get_admin_occurrences(
    listing_id: UUID,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_occurrences_page(
        db,
        listing_id=listing_id,
        status=status,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/listings/{listing_id}/occurrences", response_model=AdminOccurrenceCreateResponse
)
async def create_admin_occurrences(
    listing_id: UUID,
    payload: OccurrenceCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_occurrence_entries(
        db,
        listing_id=listing_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch(
    "/occurrences/{occurrence_id}", response_model=AdminOccurrenceUpdateResponse
)
async def update_admin_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_admin_occurrence_entry(
        db,
        occurrence_id=occurrence_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch(
    "/occurrences/{occurrence_id}/cancel", response_model=AdminOccurrenceCancelResponse
)
async def cancel_admin_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceCancelRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await cancel_admin_occurrence_entry(
        db,
        occurrence_id=occurrence_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.get("/bookings", response_model=PaginatedResponse[AdminBookingItem])
async def get_admin_bookings(
    status: str | None = Query(default=None),
    listing_type: ListingType | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    listing: str | None = Query(default=None),
    user: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_bookings_page(
        db,
        status=status,
        listing_type=listing_type,
        date_from=date_from,
        date_to=date_to,
        listing=listing,
        user=user,
        page=page,
        page_size=page_size,
    )


@router.get("/offers", response_model=PaginatedResponse[AdminOfferItem])
async def get_admin_offers(
    is_active: bool | None = Query(default=None),
    code: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_offers_page(
        db,
        is_active=is_active,
        code=code,
        page=page,
        page_size=page_size,
    )


@router.post("/offers", response_model=AdminOfferMutationResponse)
async def create_admin_offer(
    payload: OfferCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_offer_entry(
        db,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch("/offers/{offer_id}", response_model=AdminOfferMutationResponse)
async def update_admin_offer(
    offer_id: UUID,
    payload: OfferUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_admin_offer_entry(
        db,
        offer_id=offer_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.get("/audit-logs", response_model=PaginatedResponse[AdminAuditLogItem])
async def get_admin_audit_logs(
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_admin_audit_logs_page(
        db,
        action=action,
        entity_type=entity_type,
        page=page,
        page_size=page_size,
    )


@router.post("/cities", response_model=MessageResponse)
async def create_city(
    payload: CityCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_city_entry(
        db,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch("/cities/{city_id}", response_model=AdminCityMutationResponse)
async def update_city(
    city_id: UUID,
    payload: CityUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_admin_city_entry(
        db,
        city_id=city_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.post("/venues", response_model=AdminVenueCreateResponse)
async def create_venue(
    payload: VenueCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_venue_entry(
        db,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.patch("/venues/{venue_id}", response_model=AdminVenueCreateResponse)
async def update_venue(
    venue_id: UUID,
    payload: VenueUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_admin_venue_entry(
        db,
        venue_id=venue_id,
        payload=payload,
        admin_user_id=admin_user.id,
    )


@router.delete("/venues/{venue_id}", response_model=AdminVenueCreateResponse)
async def soft_delete_venue(
    venue_id: UUID,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await soft_delete_admin_venue_entry(
        db,
        venue_id=venue_id,
        admin_user_id=admin_user.id,
    )
