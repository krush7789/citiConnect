import asyncio
import logging
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import require_admin
from app.core.errors import raise_api_error
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.city import City
from app.models.enums import (
    BookingStatus,
    ListingStatus,
    ListingType,
    OccurrenceStatus,
)
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.offer import Offer
from app.models.user import User
from app.models.venue import Venue
from app.schema.admin import (
    AdminAuditLogItem,
    AdminBookingItem,
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
    ListingCreateRequest,
    ListingUpdateRequest,
    OccurrenceCancelRequest,
    OccurrenceCreateRequest,
    OccurrenceUpdateRequest,
    OfferCreateRequest,
    OfferUpdateRequest,
    VenueCreateRequest,
)
from app.schema.common import MessageResponse, PaginatedResponse
from app.services.admin import (
    add_audit_log as _add_audit_log,
    build_venue_geocode_query as _build_venue_geocode_query,
    is_nationwide_city_name as _is_nationwide_city_name,
    normalize_discount_type as _normalize_discount_type,
    normalize_json_dict as _normalize_json_dict,
    normalize_limit as _normalize_limit,
    normalize_optional_text as _normalize_optional_text,
    normalize_seat_layout as _normalize_seat_layout,
    normalize_string_list as _normalize_string_list,
    pagination_payload as _pagination_payload,
    parse_booking_status as _parse_booking_status,
    parse_listing_status as _parse_listing_status,
    parse_listing_type as _parse_listing_type,
    parse_occurrence_status as _parse_occurrence_status,
    parse_uuid_or_none as _parse_uuid_or_none,
    resolve_listing_city_and_venue as _resolve_listing_city_and_venue,
    serialize_listing_detail as _serialize_listing_detail,
    serialize_listing_row as _serialize_listing_row,
    serialize_occurrence_row as _serialize_occurrence_row,
    validate_occurrence_window as _validate_occurrence_window,
    validate_price_range as _validate_price_range,
)
from app.services.email import send_occurrence_cancelled_email
from app.services.geocoding import geocode_address

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

@router.get("/dashboard", response_model=AdminDashboardResponse)
async def get_dashboard(
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    start_of_day = datetime.combine(now.date(), time.min, tzinfo=UTC)
    next_day = start_of_day + timedelta(days=1)
    week_ago = now - timedelta(days=7)

    total_listings = int(
        (await db.execute(select(func.count(Listing.id)))).scalar_one() or 0
    )
    active_listings = int(
        (
            await db.execute(
                select(func.count(Listing.id)).where(
                    Listing.status == ListingStatus.PUBLISHED
                )
            )
        ).scalar_one()
        or 0
    )
    total_bookings = int(
        (await db.execute(select(func.count(Booking.id)))).scalar_one() or 0
    )
    bookings_today = int(
        (
            await db.execute(
                select(func.count(Booking.id)).where(
                    Booking.created_at >= start_of_day, Booking.created_at < next_day
                )
            )
        ).scalar_one()
        or 0
    )
    bookings_this_week = int(
        (
            await db.execute(
                select(func.count(Booking.id)).where(Booking.created_at >= week_ago)
            )
        ).scalar_one()
        or 0
    )
    active_users = int(
        (
            await db.execute(select(func.count(func.distinct(Booking.user_id))))
        ).scalar_one()
        or 0
    )
    total_revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Booking.final_price), 0)).where(
                Booking.status == BookingStatus.CONFIRMED
            )
        )
    ).scalar_one() or Decimal("0")

    recent_rows = (
        await db.execute(
            select(
                Booking.id,
                User.name,
                Listing.title,
                Booking.quantity,
                Booking.final_price,
                Booking.status,
                Booking.created_at,
            )
            .join(User, User.id == Booking.user_id, isouter=True)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id, isouter=True)
            .join(Listing, Listing.id == Occurrence.listing_id, isouter=True)
            .order_by(Booking.created_at.desc())
            .limit(6)
        )
    ).all()

    top_rows = (
        await db.execute(
            select(
                Listing.id,
                Listing.title,
                func.count(Booking.id).label("total_bookings"),
            )
            .join(Occurrence, Occurrence.listing_id == Listing.id, isouter=True)
            .join(Booking, Booking.occurrence_id == Occurrence.id, isouter=True)
            .group_by(Listing.id, Listing.title)
            .order_by(func.count(Booking.id).desc(), Listing.title.asc())
            .limit(6)
        )
    ).all()

    category_group_expr = func.coalesce(
        func.nullif(func.trim(Listing.category), ""), "Uncategorized"
    )
    category_rows = (
        await db.execute(
            select(
                category_group_expr.label("category"),
                func.count(Booking.id).label("total_bookings"),
                func.coalesce(func.sum(Booking.final_price), 0).label("total_sales"),
            )
            .join(Occurrence, Occurrence.listing_id == Listing.id)
            .join(Booking, Booking.occurrence_id == Occurrence.id)
            .where(Booking.status == BookingStatus.CONFIRMED)
            .group_by(category_group_expr)
            .order_by(
                func.coalesce(func.sum(Booking.final_price), 0).desc(),
                category_group_expr.asc(),
            )
            .limit(8)
        )
    ).all()

    return {
        "stats": {
            "total_listings": total_listings,
            "active_listings": active_listings,
            "total_bookings": total_bookings,
            "bookings_today": bookings_today,
            "bookings_this_week": bookings_this_week,
            "active_users": active_users,
            "total_revenue": float(total_revenue),
        },
        "recent_bookings": [
            {
                "id": row[0],
                "user_name": row[1] or "User",
                "listing_title": row[2] or "Listing",
                "quantity": row[3] or 0,
                "final_price": float(row[4] or 0),
                "status": row[5],
                "created_at": row[6],
            }
            for row in recent_rows
        ],
        "top_listings": [
            {
                "id": row[0],
                "title": row[1] or "Listing",
                "total_bookings": int(row[2] or 0),
            }
            for row in top_rows
        ],
        "category_sales": [
            {
                "category": row[0] or "Uncategorized",
                "total_bookings": int(row[1] or 0),
                "total_sales": float(row[2] or 0),
            }
            for row in category_rows
        ],
    }


@router.get("/listings", response_model=PaginatedResponse[AdminListingListItem])
async def get_admin_listings(
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    city: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    type_enum = _parse_listing_type(type)
    status_enum = _parse_listing_status(status)

    booking_counts_subq = (
        select(
            Occurrence.listing_id.label("listing_id"),
            func.count(Booking.id).label("total_bookings"),
        )
        .join(Booking, Booking.occurrence_id == Occurrence.id)
        .group_by(Occurrence.listing_id)
        .subquery()
    )

    stmt = (
        select(
            Listing,
            City.name,
            func.coalesce(booking_counts_subq.c.total_bookings, 0),
        )
        .join(City, City.id == Listing.city_id)
        .outerjoin(booking_counts_subq, booking_counts_subq.c.listing_id == Listing.id)
    )
    count_stmt = select(func.count(Listing.id)).join(City, City.id == Listing.city_id)

    if type_enum:
        stmt = stmt.where(Listing.type == type_enum)
        count_stmt = count_stmt.where(Listing.type == type_enum)
    if status_enum:
        stmt = stmt.where(Listing.status == status_enum)
        count_stmt = count_stmt.where(Listing.status == status_enum)
    if q:
        query_text = q.strip()
        if query_text:
            query = f"%{query_text}%"
            listing_uuid = _parse_uuid_or_none(query_text)
            search_predicates = [
                Listing.title.ilike(query),
                Listing.category.ilike(query),
            ]
            if listing_uuid:
                search_predicates.append(Listing.id == listing_uuid)
            stmt = stmt.where(or_(*search_predicates))
            count_stmt = count_stmt.where(or_(*search_predicates))
    if city:
        city_uuid = _parse_uuid_or_none(city)
        if city_uuid:
            stmt = stmt.where(Listing.city_id == city_uuid)
            count_stmt = count_stmt.where(Listing.city_id == city_uuid)
        else:
            city_query = f"%{city.strip()}%"
            stmt = stmt.where(City.name.ilike(city_query))
            count_stmt = count_stmt.where(City.name.ilike(city_query))

    stmt = (
        stmt.order_by(Listing.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()

    items = [_serialize_listing_row(row[0], row[1], int(row[2] or 0)) for row in rows]
    return _pagination_payload(items, page, page_size, total)


@router.get("/listings/{listing_id}", response_model=AdminListingDetailResponse)
async def get_admin_listing_by_id(
    listing_id: UUID,
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(Listing, City.name, Venue.name, Venue.address)
            .join(City, City.id == Listing.city_id)
            .join(Venue, Venue.id == Listing.venue_id)
            .where(Listing.id == listing_id)
            .limit(1)
        )
    ).first()
    if not row:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing, city_name, venue_name, venue_address = row
    return {
        "listing": _serialize_listing_detail(
            listing, city_name, venue_name, venue_address
        )
    }


@router.post("/listings", response_model=AdminListingCreateResponse)
async def create_admin_listing(
    payload: ListingCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    _validate_price_range(payload.price_min, payload.price_max)
    city, venue = await _resolve_listing_city_and_venue(
        db,
        city_id=payload.city_id,
        venue_id=payload.venue_id,
    )

    listing = Listing(
        type=payload.type,
        title=payload.title.strip(),
        description=_normalize_optional_text(payload.description),
        city_id=city.id,
        venue_id=venue.id,
        category=_normalize_optional_text(payload.category),
        price_min=payload.price_min,
        price_max=payload.price_max
        if payload.price_max is not None
        else payload.price_min,
        cover_image_url=_normalize_optional_text(payload.cover_image_url),
        gallery_image_urls=_normalize_string_list(payload.gallery_image_urls),
        is_featured=payload.is_featured,
        offer_text=_normalize_optional_text(payload.offer_text),
        vibe_tags=_normalize_string_list(payload.vibe_tags),
        metadata_json=_normalize_json_dict(payload.metadata),
        status=payload.status,
        created_by=admin_user.id,
    )

    db.add(listing)
    await db.flush()
    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CREATE_LISTING",
        entity_type="LISTING",
        entity_id=str(listing.id),
        diff={
            "title": listing.title,
            "status": listing.status.value,
            "city_id": str(listing.city_id),
            "venue_id": str(listing.venue_id),
        },
    )
    await db.commit()
    await db.refresh(listing)

    return {
        "message": "Listing created successfully",
        "listing": {
            "id": listing.id,
            "status": listing.status.value,
        },
    }


@router.patch("/listings/{listing_id}", response_model=AdminListingUpdateResponse)
async def update_admin_listing(
    listing_id: UUID,
    payload: ListingUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.get(Listing, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    requested_city = "city_id" in payload.model_fields_set
    requested_venue = "venue_id" in payload.model_fields_set

    if requested_city:
        city_candidate = payload.city_id
    elif requested_venue:
        city_candidate = None
    else:
        city_candidate = listing.city_id

    if requested_venue:
        venue_candidate = payload.venue_id
    elif requested_city:
        venue_candidate = None
    else:
        venue_candidate = listing.venue_id

    selected_city, selected_venue = await _resolve_listing_city_and_venue(
        db,
        city_id=city_candidate,
        venue_id=venue_candidate,
    )

    next_price_min = (
        payload.price_min if payload.price_min is not None else listing.price_min
    )
    next_price_max = (
        payload.price_max if payload.price_max is not None else listing.price_max
    )
    _validate_price_range(next_price_min, next_price_max)

    diff: dict[str, Any] = {}

    if payload.type is not None:
        listing.type = payload.type
        diff["type"] = payload.type.value
    if payload.title is not None:
        listing.title = payload.title.strip()
        diff["title"] = listing.title
    if payload.description is not None:
        listing.description = _normalize_optional_text(payload.description)
        diff["description"] = listing.description
    if listing.city_id != selected_city.id:
        listing.city_id = selected_city.id
        diff["city_id"] = str(selected_city.id)
    if listing.venue_id != selected_venue.id:
        listing.venue_id = selected_venue.id
        diff["venue_id"] = str(selected_venue.id)
    if payload.category is not None:
        listing.category = _normalize_optional_text(payload.category)
        diff["category"] = listing.category
    if payload.price_min is not None:
        listing.price_min = payload.price_min
        diff["price_min"] = float(payload.price_min)
    if payload.price_max is not None:
        listing.price_max = payload.price_max
        diff["price_max"] = float(payload.price_max)
    if payload.status is not None:
        listing.status = payload.status
        diff["status"] = payload.status.value
    if payload.is_featured is not None:
        listing.is_featured = payload.is_featured
        diff["is_featured"] = payload.is_featured
    if payload.offer_text is not None:
        listing.offer_text = _normalize_optional_text(payload.offer_text)
        diff["offer_text"] = listing.offer_text
    if payload.cover_image_url is not None:
        listing.cover_image_url = _normalize_optional_text(payload.cover_image_url)
        diff["cover_image_url"] = listing.cover_image_url
    if payload.gallery_image_urls is not None:
        listing.gallery_image_urls = _normalize_string_list(payload.gallery_image_urls)
        diff["gallery_image_urls"] = listing.gallery_image_urls or []
    if payload.metadata is not None:
        listing.metadata_json = _normalize_json_dict(payload.metadata)
        diff["metadata"] = listing.metadata_json
    if payload.vibe_tags is not None:
        listing.vibe_tags = _normalize_string_list(payload.vibe_tags)
        diff["vibe_tags"] = listing.vibe_tags or []

    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="UPDATE_LISTING",
        entity_type="LISTING",
        entity_id=str(listing.id),
        diff=diff,
    )
    await db.commit()
    await db.refresh(listing)

    return {
        "message": "Listing updated successfully",
        "listing": {
            "id": listing.id,
            "title": listing.title,
            "offer_text": listing.offer_text or "",
            "is_featured": bool(listing.is_featured),
            "status": listing.status.value,
        },
    }


@router.delete("/listings/{listing_id}", response_model=MessageResponse)
async def archive_admin_listing(
    listing_id: UUID,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.get(Listing, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    now = datetime.now(UTC)
    cancelled_occurrences = 0

    if listing.status != ListingStatus.ARCHIVED:
        listing.status = ListingStatus.ARCHIVED

    occurrence_rows = (
        (
            await db.execute(
                select(Occurrence).where(
                    Occurrence.listing_id == listing.id,
                    Occurrence.status == OccurrenceStatus.SCHEDULED,
                )
            )
        )
        .scalars()
        .all()
    )

    for occurrence in occurrence_rows:
        reference_end = occurrence.end_time or occurrence.start_time
        if reference_end is None or reference_end >= now:
            occurrence.status = OccurrenceStatus.CANCELLED
            cancelled_occurrences += 1

    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="ARCHIVE_LISTING",
        entity_type="LISTING",
        entity_id=str(listing.id),
        diff={
            "status": ListingStatus.ARCHIVED.value,
            "cancelled_occurrences": cancelled_occurrences,
        },
    )
    await db.commit()

    return {"message": "Listing archived successfully"}


@router.get(
    "/listings/{listing_id}/occurrences",
    response_model=PaginatedResponse[AdminOccurrenceItem],
)
async def get_admin_occurrences(
    listing_id: UUID,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.get(Listing, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    status_enum = _parse_occurrence_status(status)

    stmt = (
        select(Occurrence, Venue.name)
        .join(Venue, Venue.id == Occurrence.venue_id, isouter=True)
        .where(Occurrence.listing_id == listing_id)
    )
    count_stmt = (
        select(func.count(Occurrence.id))
        .select_from(Occurrence)
        .join(Venue, Venue.id == Occurrence.venue_id, isouter=True)
        .where(Occurrence.listing_id == listing_id)
    )

    if status_enum:
        stmt = stmt.where(Occurrence.status == status_enum)
        count_stmt = count_stmt.where(Occurrence.status == status_enum)
    if q:
        query_text = q.strip()
        if query_text:
            query = f"%{query_text}%"
            occurrence_uuid = _parse_uuid_or_none(query_text)
            search_predicates = [
                Venue.name.ilike(query),
                Occurrence.provider_sub_location.ilike(query),
            ]
            if occurrence_uuid:
                search_predicates.append(Occurrence.id == occurrence_uuid)

            stmt = stmt.where(or_(*search_predicates))
            count_stmt = count_stmt.where(or_(*search_predicates))

    stmt = (
        stmt.order_by(Occurrence.start_time.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()

    items = [_serialize_occurrence_row(row[0], row[1]) for row in rows]
    return _pagination_payload(items, page, page_size, total)


@router.post(
    "/listings/{listing_id}/occurrences", response_model=AdminOccurrenceCreateResponse
)
async def create_admin_occurrences(
    listing_id: UUID,
    payload: OccurrenceCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.get(Listing, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")
    if listing.status == ListingStatus.ARCHIVED:
        raise_api_error(
            400, "INVALID_REQUEST", "Cannot create occurrences for archived listing"
        )

    listing_city = await db.get(City, listing.city_id)
    allow_cross_city_venues = _is_nationwide_city_name(
        listing_city.name if listing_city else None
    )

    created: list[Occurrence] = []
    for entry in payload.occurrences:
        _validate_occurrence_window(entry.start_time, entry.end_time)

        venue = await db.get(Venue, entry.venue_id)
        if not venue:
            raise_api_error(404, "NOT_FOUND", "Venue not found")
        if not allow_cross_city_venues and venue.city_id != listing.city_id:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"venue_id": "Venue does not belong to listing city"}},
            )

        occurrence = Occurrence(
            listing_id=listing.id,
            venue_id=venue.id,
            city_id=venue.city_id if allow_cross_city_venues else listing.city_id,
            start_time=entry.start_time,
            end_time=entry.end_time,
            provider_sub_location=_normalize_optional_text(entry.provider_sub_location),
            capacity_total=int(entry.capacity_total),
            capacity_remaining=int(entry.capacity_total),
            ticket_pricing=_normalize_json_dict(entry.ticket_pricing),
            seat_layout=_normalize_seat_layout(entry.seat_layout),
            status=OccurrenceStatus.SCHEDULED,
        )
        db.add(occurrence)
        created.append(occurrence)

    await db.flush()
    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CREATE_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(created[0].id),
        diff={"listing_id": str(listing.id), "count": len(created)},
    )
    await db.commit()

    return {
        "message": f"{len(created)} occurrence created successfully",
        "occurrences": [
            {"id": occurrence.id, "status": occurrence.status.value}
            for occurrence in created
        ],
    }


@router.patch(
    "/occurrences/{occurrence_id}", response_model=AdminOccurrenceUpdateResponse
)
async def update_admin_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    occurrence = await db.get(Occurrence, occurrence_id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing = await db.get(Listing, occurrence.listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing_city = await db.get(City, listing.city_id)
    allow_cross_city_venues = _is_nationwide_city_name(
        listing_city.name if listing_city else None
    )

    next_start = (
        payload.start_time
        if "start_time" in payload.model_fields_set
        else occurrence.start_time
    )
    next_end = (
        payload.end_time
        if "end_time" in payload.model_fields_set
        else occurrence.end_time
    )
    if next_start is None:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"start_time": "start_time is required"}},
        )
    _validate_occurrence_window(next_start, next_end)

    diff: dict[str, Any] = {}
    if "start_time" in payload.model_fields_set:
        occurrence.start_time = next_start
        diff["start_time"] = next_start.isoformat()
    if "end_time" in payload.model_fields_set:
        occurrence.end_time = next_end
        diff["end_time"] = next_end.isoformat() if next_end else None

    venue = await db.get(Venue, occurrence.venue_id)
    if "venue_id" in payload.model_fields_set:
        if payload.venue_id is None:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"venue_id": "venue_id is required"}},
            )
        next_venue = await db.get(Venue, payload.venue_id)
        if not next_venue:
            raise_api_error(404, "NOT_FOUND", "Venue not found")
        if not allow_cross_city_venues and next_venue.city_id != listing.city_id:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"venue_id": "Venue does not belong to listing city"}},
            )
        occurrence.venue_id = next_venue.id
        occurrence.city_id = (
            next_venue.city_id if allow_cross_city_venues else listing.city_id
        )
        venue = next_venue
        diff["venue_id"] = str(next_venue.id)
        diff["city_id"] = str(occurrence.city_id)

    if "provider_sub_location" in payload.model_fields_set:
        occurrence.provider_sub_location = _normalize_optional_text(
            payload.provider_sub_location
        )
        diff["provider_sub_location"] = occurrence.provider_sub_location

    if "capacity_total" in payload.model_fields_set:
        next_total = int(payload.capacity_total or 0)
        used_capacity = max(
            0,
            int(occurrence.capacity_total or 0)
            - int(occurrence.capacity_remaining or 0),
        )
        if next_total < used_capacity:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {
                    "fields": {
                        "capacity_total": "capacity_total cannot be less than currently used seats"
                    }
                },
            )
        occurrence.capacity_total = next_total
        occurrence.capacity_remaining = next_total - used_capacity
        diff["capacity_total"] = next_total
        diff["capacity_remaining"] = occurrence.capacity_remaining

    if "ticket_pricing" in payload.model_fields_set:
        occurrence.ticket_pricing = _normalize_json_dict(payload.ticket_pricing)
        diff["ticket_pricing"] = occurrence.ticket_pricing

    if "seat_layout" in payload.model_fields_set:
        occurrence.seat_layout = _normalize_seat_layout(payload.seat_layout)
        diff["seat_layout"] = occurrence.seat_layout

    if "status" in payload.model_fields_set and payload.status is not None:
        if payload.status == OccurrenceStatus.CANCELLED:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {
                    "fields": {
                        "status": "Use the cancel endpoint to cancel an occurrence"
                    }
                },
            )
        occurrence.status = payload.status
        diff["status"] = payload.status.value

    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="UPDATE_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(occurrence.id),
        diff=diff,
    )
    await db.commit()
    await db.refresh(occurrence)

    if venue is None:
        venue = await db.get(Venue, occurrence.venue_id)

    return {
        "message": "Occurrence updated successfully",
        "occurrence": _serialize_occurrence_row(
            occurrence, venue.name if venue else None
        ),
    }


@router.patch(
    "/occurrences/{occurrence_id}/cancel", response_model=AdminOccurrenceCancelResponse
)
async def cancel_admin_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceCancelRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    occurrence = await db.get(Occurrence, occurrence_id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing = await db.get(Listing, occurrence.listing_id)
    venue = await db.get(Venue, occurrence.venue_id)
    reason = _normalize_optional_text(payload.reason) or "Occurrence cancelled by admin"
    if occurrence.status != OccurrenceStatus.CANCELLED:
        occurrence.status = OccurrenceStatus.CANCELLED
    occurrence.capacity_remaining = occurrence.capacity_total

    affected_rows = (
        (
            await db.execute(
                select(Booking, User.name, User.email)
                .join(User, User.id == Booking.user_id)
                .where(
                    Booking.occurrence_id == occurrence.id,
                    Booking.status.in_([BookingStatus.HOLD, BookingStatus.CONFIRMED]),
                )
            )
        )
        .all()
    )

    email_payloads: list[dict[str, Any]] = []
    for booking, user_name, user_email in affected_rows:
        booking.status = BookingStatus.CANCELLED
        booking.cancellation_reason = reason
        booking.hold_expires_at = None

        if not user_email:
            continue

        listing_snapshot = (
            booking.listing_snapshot if isinstance(booking.listing_snapshot, dict) else {}
        )
        email_payloads.append(
            {
                "to_email": str(user_email),
                "recipient_name": str(user_name or ""),
                "booking_id": booking.id,
                "listing_title": str(
                    listing_snapshot.get("title")
                    or (listing.title if listing else "Your booking")
                ),
                "start_time": occurrence.start_time,
                "venue_name": str(
                    listing_snapshot.get("venue_name") or (venue.name if venue else "")
                ),
                "venue_address": str(
                    listing_snapshot.get("address")
                    or (venue.address if venue else "")
                ),
                "reason": reason,
                "total_amount": booking.final_price or booking.total_price,
                "currency": str(listing_snapshot.get("currency") or "INR"),
            }
        )

    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CANCEL_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(occurrence.id),
        diff={"reason": reason, "cancelled_bookings": len(affected_rows)},
    )
    await db.commit()

    if email_payloads:
        results = await asyncio.gather(
            *(
                send_occurrence_cancelled_email(
                    to_email=payload["to_email"],
                    recipient_name=payload["recipient_name"],
                    booking_id=payload["booking_id"],
                    listing_title=payload["listing_title"],
                    start_time=payload["start_time"],
                    venue_name=payload["venue_name"],
                    venue_address=payload["venue_address"],
                    reason=payload["reason"],
                    total_amount=payload["total_amount"],
                    currency=payload["currency"],
                    fail_silently=True,
                )
                for payload in email_payloads
            )
        )
        failed_count = len([result for result in results if not result])
        if failed_count:
            logger.warning(
                "Occurrence cancellation email delivery failed for occurrence_id=%s (%s/%s failed).",
                occurrence.id,
                failed_count,
                len(email_payloads),
            )

    return {
        "message": "Occurrence cancelled. Related bookings cancelled.",
        "occurrence_id": occurrence.id,
    }


@router.get("/bookings", response_model=PaginatedResponse[AdminBookingItem])
async def get_admin_bookings(
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    listing: str | None = Query(default=None),
    user: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    status_enum = _parse_booking_status(status)

    stmt = (
        select(
            Booking.id,
            User.id,
            User.name,
            User.email,
            Listing.title,
            Listing.type,
            Occurrence.start_time,
            Booking.quantity,
            Booking.final_price,
            Booking.status,
            Booking.created_at,
        )
        .join(User, User.id == Booking.user_id, isouter=True)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id, isouter=True)
        .join(Listing, Listing.id == Occurrence.listing_id, isouter=True)
    )
    count_stmt = (
        select(func.count(Booking.id))
        .join(User, User.id == Booking.user_id, isouter=True)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id, isouter=True)
        .join(Listing, Listing.id == Occurrence.listing_id, isouter=True)
    )

    if status_enum:
        stmt = stmt.where(Booking.status == status_enum)
        count_stmt = count_stmt.where(Booking.status == status_enum)
    if date_from:
        from_dt = datetime.combine(date_from, time.min, tzinfo=UTC)
        stmt = stmt.where(Booking.created_at >= from_dt)
        count_stmt = count_stmt.where(Booking.created_at >= from_dt)
    if date_to:
        to_dt = datetime.combine(date_to, time.max, tzinfo=UTC)
        stmt = stmt.where(Booking.created_at <= to_dt)
        count_stmt = count_stmt.where(Booking.created_at <= to_dt)
    if listing:
        query = f"%{listing.strip()}%"
        stmt = stmt.where(Listing.title.ilike(query))
        count_stmt = count_stmt.where(Listing.title.ilike(query))
    if user:
        query = f"%{user.strip()}%"
        stmt = stmt.where(or_(User.name.ilike(query), User.email.ilike(query)))
        count_stmt = count_stmt.where(
            or_(User.name.ilike(query), User.email.ilike(query))
        )

    stmt = (
        stmt.order_by(Booking.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()

    items = [
        {
            "id": row[0],
            "user": {"id": row[1], "name": row[2] or "User", "email": row[3] or ""},
            "listing_title": row[4] or "Listing",
            "listing_type": row[5].value if row[5] else None,
            "occurrence_start": row[6],
            "quantity": int(row[7] or 0),
            "final_price": float(row[8] or 0),
            "status": row[9].value if row[9] else None,
            "created_at": row[10],
        }
        for row in rows
    ]
    return _pagination_payload(items, page, page_size, total)


@router.get("/offers", response_model=PaginatedResponse[AdminOfferItem])
async def get_admin_offers(
    is_active: bool | None = Query(default=None),
    code: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Offer)
    count_stmt = select(func.count(Offer.id))

    if is_active is not None:
        stmt = stmt.where(Offer.is_active == is_active)
        count_stmt = count_stmt.where(Offer.is_active == is_active)
    if code:
        query = f"%{code.strip()}%"
        stmt = stmt.where(Offer.code.ilike(query))
        count_stmt = count_stmt.where(Offer.code.ilike(query))

    stmt = stmt.order_by(Offer.valid_until.desc().nulls_last(), Offer.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).scalars().all()
    items = [
        {
            "id": row.id,
            "code": row.code,
            "title": row.title,
            "description": row.description,
            "discount_type": row.discount_type.value,
            "discount_value": float(row.discount_value),
            "min_order_value": float(row.min_order_value)
            if row.min_order_value is not None
            else None,
            "max_discount_value": float(row.max_discount_value)
            if row.max_discount_value is not None
            else None,
            "valid_from": row.valid_from,
            "valid_until": row.valid_until,
            "usage_limit": row.usage_limit,
            "user_usage_limit": row.user_usage_limit,
            "is_active": row.is_active,
            "applicability": row.applicability or {},
        }
        for row in rows
    ]
    return _pagination_payload(items, page, page_size, total)


@router.post("/offers", response_model=AdminOfferMutationResponse)
async def create_admin_offer(
    payload: OfferCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    code = payload.code.strip().upper()
    if not code:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"code": "Code is required"}},
        )

    existing = (
        await db.execute(
            select(Offer.id).where(func.lower(Offer.code) == code.lower()).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        raise_api_error(409, "DUPLICATE_CODE", "Offer code already exists")

    offer = Offer(
        code=code,
        title=payload.title.strip(),
        description=None,
        discount_type=_normalize_discount_type(payload.discount_type),
        discount_value=payload.discount_value,
        min_order_value=payload.min_order_value,
        max_discount_value=payload.max_discount_value,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        usage_limit=_normalize_limit(payload.usage_limit),
        user_usage_limit=_normalize_limit(payload.user_usage_limit),
        is_active=payload.is_active,
        applicability=payload.applicability or {},
    )
    db.add(offer)
    await db.flush()
    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CREATE_OFFER",
        entity_type="OFFER",
        entity_id=str(offer.id),
        diff={"code": offer.code, "is_active": offer.is_active},
    )
    await db.commit()
    await db.refresh(offer)

    return {
        "message": "Offer created successfully",
        "offer": {"id": offer.id, "code": offer.code, "is_active": offer.is_active},
    }


@router.patch("/offers/{offer_id}", response_model=AdminOfferMutationResponse)
async def update_admin_offer(
    offer_id: UUID,
    payload: OfferUpdateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    offer = await db.get(Offer, offer_id)
    if not offer:
        raise_api_error(404, "NOT_FOUND", "Offer not found")

    diff: dict[str, Any] = {}
    if payload.code is not None:
        code = payload.code.strip().upper()
        if not code:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"code": "Code cannot be empty"}},
            )
        duplicate = (
            await db.execute(
                select(Offer.id)
                .where(func.lower(Offer.code) == code.lower(), Offer.id != offer.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if duplicate:
            raise_api_error(409, "DUPLICATE_CODE", "Offer code already exists")
        offer.code = code
        diff["code"] = code

    if payload.title is not None:
        offer.title = payload.title.strip()
        diff["title"] = offer.title
    if payload.discount_type is not None:
        offer.discount_type = _normalize_discount_type(payload.discount_type)
        diff["discount_type"] = offer.discount_type.value
    if payload.discount_value is not None:
        offer.discount_value = payload.discount_value
        diff["discount_value"] = float(payload.discount_value)
    if payload.min_order_value is not None:
        offer.min_order_value = payload.min_order_value
        diff["min_order_value"] = float(payload.min_order_value)
    if payload.max_discount_value is not None:
        offer.max_discount_value = payload.max_discount_value
        diff["max_discount_value"] = float(payload.max_discount_value)
    if payload.valid_from is not None:
        offer.valid_from = payload.valid_from
        diff["valid_from"] = payload.valid_from.isoformat()
    if payload.valid_until is not None:
        offer.valid_until = payload.valid_until
        diff["valid_until"] = payload.valid_until.isoformat()
    if payload.usage_limit is not None:
        offer.usage_limit = _normalize_limit(payload.usage_limit)
        diff["usage_limit"] = offer.usage_limit
    if payload.user_usage_limit is not None:
        offer.user_usage_limit = _normalize_limit(payload.user_usage_limit)
        diff["user_usage_limit"] = offer.user_usage_limit
    if payload.is_active is not None:
        offer.is_active = payload.is_active
        diff["is_active"] = payload.is_active
    if payload.applicability is not None:
        offer.applicability = payload.applicability
        diff["applicability"] = payload.applicability

    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="UPDATE_OFFER",
        entity_type="OFFER",
        entity_id=str(offer.id),
        diff=diff,
    )
    await db.commit()

    return {
        "message": "Offer updated successfully",
        "offer": {"id": offer.id, "code": offer.code, "is_active": offer.is_active},
    }


@router.get("/audit-logs", response_model=PaginatedResponse[AdminAuditLogItem])
async def get_admin_audit_logs(
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    _: object = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AdminAuditLog, User.name).join(
        User, User.id == AdminAuditLog.admin_user_id, isouter=True
    )
    count_stmt = select(func.count(AdminAuditLog.id))

    if action:
        stmt = stmt.where(AdminAuditLog.action == action.strip().upper())
        count_stmt = count_stmt.where(AdminAuditLog.action == action.strip().upper())
    if entity_type:
        stmt = stmt.where(AdminAuditLog.entity_type == entity_type.strip().upper())
        count_stmt = count_stmt.where(
            AdminAuditLog.entity_type == entity_type.strip().upper()
        )

    stmt = (
        stmt.order_by(AdminAuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "id": row[0].id,
            "admin_user": row[1] or "Admin",
            "action": row[0].action,
            "entity_type": row[0].entity_type,
            "entity_id": row[0].entity_id,
            "diff": row[0].diff or {},
            "created_at": row[0].created_at,
        }
        for row in rows
    ]
    return _pagination_payload(items, page, page_size, total)


@router.post("/cities", response_model=MessageResponse)
async def create_city(
    payload: CityCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"name": "City name is required"}},
        )

    duplicate = (
        await db.execute(
            select(City.id).where(func.lower(City.name) == name.lower()).limit(1)
        )
    ).scalar_one_or_none()
    if duplicate:
        raise_api_error(409, "DUPLICATE_CITY", "City already exists")

    city = City(
        name=name,
        state=_normalize_optional_text(payload.state),
        image_url=_normalize_optional_text(payload.image_url),
        is_active=payload.is_active,
    )
    db.add(city)
    await db.flush()
    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CREATE_CITY",
        entity_type="CITY",
        entity_id=str(city.id),
        diff={"name": city.name, "state": city.state, "is_active": city.is_active},
    )
    await db.commit()
    return {"message": "City created successfully"}


@router.post("/venues", response_model=AdminVenueCreateResponse)
async def create_venue(
    payload: VenueCreateRequest,
    admin_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    city = await db.get(City, payload.city_id)
    if not city:
        raise_api_error(404, "NOT_FOUND", "City not found")

    normalized_name = payload.name.strip()
    normalized_address = _normalize_optional_text(payload.address)
    latitude = payload.latitude
    longitude = payload.longitude

    geocode_used = False
    if normalized_address and (latitude is None or longitude is None):
        geocode_query = _build_venue_geocode_query(
            venue_name=normalized_name,
            address=normalized_address,
            city=city,
        )
        coordinates = await geocode_address(geocode_query)
        if coordinates:
            geocode_used = True
            if latitude is None:
                latitude = coordinates[0]
            if longitude is None:
                longitude = coordinates[1]

    venue = Venue(
        name=normalized_name,
        city_id=payload.city_id,
        address=normalized_address,
        venue_type=payload.venue_type,
        latitude=latitude,
        longitude=longitude,
        is_active=payload.is_active,
    )
    db.add(venue)
    await db.flush()
    await _add_audit_log(
        db,
        admin_user_id=admin_user.id,
        action="CREATE_VENUE",
        entity_type="VENUE",
        entity_id=str(venue.id),
        diff={
            "name": venue.name,
            "city_id": str(venue.city_id),
            "venue_type": venue.venue_type.value,
            "latitude": venue.latitude,
            "longitude": venue.longitude,
            "geocode_used": geocode_used,
        },
    )
    await db.commit()
    await db.refresh(venue)

    return {
        "message": "Venue created successfully",
        "venue": {
            "id": venue.id,
            "name": venue.name,
            "city_id": venue.city_id,
            "address": venue.address,
            "venue_type": venue.venue_type.value,
            "latitude": venue.latitude,
            "longitude": venue.longitude,
            "is_active": venue.is_active,
        },
    }
