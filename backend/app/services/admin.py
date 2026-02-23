from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any, TypeVar
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.admin_audit_log import AdminAuditLog
from app.models.city import City
from app.models.enums import (
    BookingStatus,
    DiscountType,
    ListingStatus,
    ListingType,
    NotificationType,
    OccurrenceStatus,
    VenueType,
)
from app.models.listing import Listing
from app.models.notification import Notification
from app.models.occurrence import Occurrence
from app.models.offer import Offer
from app.models.venue import Venue
from app.repository import admin as admin_repository
from app.schema.admin import (
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
from app.services.email import send_occurrence_cancelled_email
from app.services.geocoding import geocode_address
from app.utils.pagination import build_paginated_response

logger = logging.getLogger(__name__)

NATIONWIDE_CITY_NAME = "All India"
NATIONWIDE_CITY_STATE = "Nationwide"
NATIONWIDE_VENUE_NAME = "Multiple Venues"
NATIONWIDE_VENUE_ADDRESS = "Venue announced later"

EnumType = TypeVar("EnumType", bound=Enum)


def normalize_discount_type(raw: str) -> DiscountType:
    candidate = raw.strip().upper()
    if candidate == "PERCENTAGE":
        candidate = "PERCENT"
    try:
        return DiscountType(candidate)
    except ValueError:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"discount_type": "Invalid discount type"}},
        )


def normalize_limit(value: int | None) -> int | None:
    if value is None or value <= 0:
        return None
    return value


def _parse_enum_value(
    value: str | None,
    enum_cls: type[EnumType],
    *,
    field_name: str,
    message: str,
) -> EnumType | None:
    if not value:
        return None
    try:
        return enum_cls(value.strip().upper())
    except ValueError:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {field_name: message}},
        )


def parse_booking_status(value: str | None) -> BookingStatus | None:
    return _parse_enum_value(
        value,
        BookingStatus,
        field_name="status",
        message="Invalid booking status",
    )


def parse_listing_type(value: str | None) -> ListingType | None:
    return _parse_enum_value(
        value,
        ListingType,
        field_name="type",
        message="Invalid listing type",
    )


def parse_listing_status(value: str | None) -> ListingStatus | None:
    return _parse_enum_value(
        value,
        ListingStatus,
        field_name="status",
        message="Invalid listing status",
    )


def parse_occurrence_status(value: str | None) -> OccurrenceStatus | None:
    return _parse_enum_value(
        value,
        OccurrenceStatus,
        field_name="status",
        message="Invalid occurrence status",
    )


def parse_uuid_or_none(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value.strip())
    except ValueError:
        return None


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_string_list(items: list[str] | None) -> list[str] | None:
    if not items:
        return None
    cleaned = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    return cleaned or None


def normalize_json_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_seat_layout(value: Any) -> Any | None:
    if isinstance(value, (dict, list)):
        return value
    return None


def build_venue_geocode_query(*, venue_name: str, address: str, city: City) -> str:
    parts: list[str] = [venue_name.strip(), address.strip(), city.name.strip()]
    if city.state:
        parts.append(city.state.strip())
    parts.append("India")
    return ", ".join([part for part in parts if part])


def is_nationwide_city_name(value: str | None) -> bool:
    cleaned = (value or "").strip().lower()
    return cleaned in {"all india", "nationwide", "pan india", "pan-india"}


async def get_or_create_city(
    db: AsyncSession,
    *,
    name: str,
    state: str | None = None,
) -> City:
    existing = await admin_repository.find_city_by_name_case_insensitive(db, name)
    if existing:
        return existing

    city = City(
        name=name.strip(),
        state=normalize_optional_text(state),
        is_active=True,
    )
    admin_repository.add_instance(db, city)
    await admin_repository.flush(db)
    return city


async def get_or_create_city_placeholder_venue(
    db: AsyncSession,
    *,
    city: City,
    venue_name: str,
    address: str | None = None,
) -> Venue:
    existing = await admin_repository.find_venue_by_city_and_name_case_insensitive(
        db,
        city_id=city.id,
        venue_name=venue_name,
    )
    if existing:
        return existing

    venue = Venue(
        name=venue_name.strip(),
        city_id=city.id,
        address=normalize_optional_text(address),
        venue_type=VenueType.EVENT_SPACE,
        is_active=True,
    )
    admin_repository.add_instance(db, venue)
    await admin_repository.flush(db)
    return venue


async def resolve_listing_city_and_venue(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    venue_id: UUID | None,
) -> tuple[City, Venue]:
    city = await admin_repository.get_city(db, city_id) if city_id else None
    if city_id and not city:
        raise_api_error(404, "NOT_FOUND", "City not found")

    venue = await admin_repository.get_venue(db, venue_id) if venue_id else None
    if venue_id and not venue:
        raise_api_error(404, "NOT_FOUND", "Venue not found")

    if city and venue and venue.city_id != city.id:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"venue_id": "Venue does not belong to selected city"}},
        )

    if city is None and venue is not None:
        city = await admin_repository.get_city(db, venue.city_id)
        if city is None:
            raise_api_error(404, "NOT_FOUND", "City not found")

    if city is None:
        city = await get_or_create_city(
            db,
            name=NATIONWIDE_CITY_NAME,
            state=NATIONWIDE_CITY_STATE,
        )

    if venue is None:
        if is_nationwide_city_name(city.name):
            venue = await get_or_create_city_placeholder_venue(
                db,
                city=city,
                venue_name=NATIONWIDE_VENUE_NAME,
                address=NATIONWIDE_VENUE_ADDRESS,
            )
        else:
            venue = await get_or_create_city_placeholder_venue(
                db,
                city=city,
                venue_name=f"{city.name} - Multiple Venues",
                address="Venue announced later",
            )

    return city, venue


def normalize_ticket_pricing(ticket_pricing: Any) -> dict[str, float] | None:
    if isinstance(ticket_pricing, dict):
        normalized = {}
        for key, value in ticket_pricing.items():
            key_text = str(key).strip().upper()
            if not key_text or value is None:
                continue
            try:
                normalized[key_text] = float(value)
            except (TypeError, ValueError):
                continue
        return normalized or None
    return None


def validate_price_range(price_min: Decimal | None, price_max: Decimal | None) -> None:
    if price_min is not None and price_max is not None and price_min > price_max:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {
                "fields": {
                    "price_max": "price_max must be greater than or equal to price_min"
                }
            },
        )


def validate_occurrence_window(
    start_time: datetime, end_time: datetime | None
) -> None:
    if end_time is not None and start_time >= end_time:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"end_time": "end_time must be later than start_time"}},
        )


def pagination_payload(
    items: list[dict[str, Any]], page: int, page_size: int, total: int
) -> dict[str, Any]:
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


def serialize_listing_row(
    listing: Listing, city_name: str | None, total_bookings: int
) -> dict[str, Any]:
    display_city = (
        "All India" if is_nationwide_city_name(city_name) else (city_name or "Unknown")
    )
    return {
        "id": listing.id,
        "type": listing.type.value,
        "title": listing.title,
        "city": display_city,
        "city_id": listing.city_id,
        "status": listing.status.value,
        "total_bookings": int(total_bookings),
        "created_at": listing.created_at,
        "offer_text": listing.offer_text or "",
        "is_featured": bool(listing.is_featured),
    }


def serialize_listing_detail(
    listing: Listing,
    city_name: str | None,
    venue_name: str | None,
    venue_address: str | None,
) -> dict[str, Any]:
    is_nationwide = is_nationwide_city_name(city_name)
    gallery_image_urls = (
        listing.gallery_image_urls if isinstance(listing.gallery_image_urls, list) else []
    )
    cover_image_url = listing.cover_image_url or (
        gallery_image_urls[0] if gallery_image_urls else None
    )

    return {
        "id": listing.id,
        "type": listing.type.value,
        "title": listing.title,
        "description": listing.description or "",
        "city_id": None if is_nationwide else listing.city_id,
        "city": "All India" if is_nationwide else (city_name or "Unknown"),
        "venue_id": None if is_nationwide else listing.venue_id,
        "venue_name": None if is_nationwide else venue_name,
        "address": None if is_nationwide else venue_address,
        "category": listing.category or "",
        "price_min": float(listing.price_min) if listing.price_min is not None else None,
        "price_max": float(listing.price_max) if listing.price_max is not None else None,
        "currency": "INR",
        "status": listing.status.value,
        "is_featured": bool(listing.is_featured),
        "offer_text": listing.offer_text or "",
        "cover_image_url": cover_image_url,
        "gallery_image_urls": gallery_image_urls,
        "metadata": listing.metadata_json if isinstance(listing.metadata_json, dict) else {},
        "vibe_tags": listing.vibe_tags if isinstance(listing.vibe_tags, list) else [],
        "is_nationwide": is_nationwide,
        "created_at": listing.created_at,
        "updated_at": listing.updated_at,
    }


def serialize_occurrence_row(
    occurrence: Occurrence, venue_name: str | None
) -> dict[str, Any]:
    return {
        "id": occurrence.id,
        "listing_id": occurrence.listing_id,
        "city_id": occurrence.city_id,
        "venue_id": occurrence.venue_id,
        "venue_name": venue_name,
        "start_time": occurrence.start_time,
        "end_time": occurrence.end_time,
        "provider_sub_location": occurrence.provider_sub_location,
        "capacity_total": int(occurrence.capacity_total or 0),
        "capacity_remaining": int(occurrence.capacity_remaining or 0),
        "ticket_pricing": normalize_ticket_pricing(occurrence.ticket_pricing),
        "seat_layout": normalize_seat_layout(occurrence.seat_layout),
        "status": occurrence.status.value,
    }


async def add_audit_log(
    db: AsyncSession,
    *,
    admin_user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict[str, Any] | None = None,
) -> None:
    admin_repository.add_instance(
        db,
        AdminAuditLog(
            admin_user_id=admin_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            diff=diff or {},
        ),
    )


async def get_admin_dashboard(db: AsyncSession) -> dict[str, Any]:
    now = datetime.now()
    start_of_day = datetime.combine(now.date(), time.min)
    next_day = start_of_day + timedelta(days=1)
    week_ago = now - timedelta(days=7)

    payload = await admin_repository.fetch_dashboard_payload(
        db,
        start_of_day=start_of_day,
        next_day=next_day,
        week_ago=week_ago,
    )
    total_revenue = payload["total_revenue"] or Decimal("0")
    recent_rows = payload["recent_rows"]
    top_rows = payload["top_rows"]
    category_rows = payload["category_rows"]

    return {
        "stats": {
            "total_listings": payload["total_listings"],
            "active_listings": payload["active_listings"],
            "total_bookings": payload["total_bookings"],
            "bookings_today": payload["bookings_today"],
            "bookings_this_week": payload["bookings_this_week"],
            "active_users": payload["active_users"],
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


async def get_admin_listings_page(
    db: AsyncSession,
    *,
    type: str | None,
    status: str | None,
    city: str | None,
    q: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    type_enum = parse_listing_type(type)
    status_enum = parse_listing_status(status)

    query_text = q.strip() if q and q.strip() else None
    listing_uuid = parse_uuid_or_none(query_text)
    city_uuid = parse_uuid_or_none(city)
    city_query_text = city.strip() if city and not city_uuid and city.strip() else None

    rows, total = await admin_repository.list_admin_listings(
        db,
        type_enum=type_enum,
        status_enum=status_enum,
        query_text=query_text,
        listing_uuid=listing_uuid,
        city_uuid=city_uuid,
        city_query_text=city_query_text,
        page=page,
        page_size=page_size,
    )

    items = [
        serialize_listing_row(listing, city_name, total_bookings)
        for listing, city_name, total_bookings in rows
    ]
    return pagination_payload(items, page, page_size, total)


async def get_admin_listing_detail(db: AsyncSession, listing_id: UUID) -> dict[str, Any]:
    row = await admin_repository.get_listing_with_location(db, listing_id)
    if not row:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing, city_name, venue_name, venue_address = row
    return {
        "listing": serialize_listing_detail(listing, city_name, venue_name, venue_address)
    }


async def create_admin_listing_entry(
    db: AsyncSession,
    *,
    payload: ListingCreateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    validate_price_range(payload.price_min, payload.price_max)
    city, venue = await resolve_listing_city_and_venue(
        db,
        city_id=payload.city_id,
        venue_id=payload.venue_id,
    )

    listing = Listing(
        type=payload.type,
        title=payload.title.strip(),
        description=normalize_optional_text(payload.description),
        city_id=city.id,
        venue_id=venue.id,
        category=normalize_optional_text(payload.category),
        price_min=payload.price_min,
        price_max=payload.price_max
        if payload.price_max is not None
        else payload.price_min,
        cover_image_url=normalize_optional_text(payload.cover_image_url),
        gallery_image_urls=normalize_string_list(payload.gallery_image_urls),
        is_featured=payload.is_featured,
        offer_text=normalize_optional_text(payload.offer_text),
        vibe_tags=normalize_string_list(payload.vibe_tags),
        metadata_json=normalize_json_dict(payload.metadata),
        status=payload.status,
        created_by=admin_user_id,
    )
    admin_repository.add_instance(db, listing)
    await admin_repository.flush(db)
    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
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
    await admin_repository.commit(db)
    await admin_repository.refresh(db, listing)

    return {
        "message": "Listing created successfully",
        "listing": {
            "id": listing.id,
            "status": listing.status.value,
        },
    }


async def update_admin_listing_entry(
    db: AsyncSession,
    *,
    listing_id: UUID,
    payload: ListingUpdateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    listing = await admin_repository.get_listing(db, listing_id)
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

    selected_city, selected_venue = await resolve_listing_city_and_venue(
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
    validate_price_range(next_price_min, next_price_max)

    diff: dict[str, Any] = {}

    if payload.type is not None:
        listing.type = payload.type
        diff["type"] = payload.type.value
    if payload.title is not None:
        listing.title = payload.title.strip()
        diff["title"] = listing.title
    if payload.description is not None:
        listing.description = normalize_optional_text(payload.description)
        diff["description"] = listing.description
    if listing.city_id != selected_city.id:
        listing.city_id = selected_city.id
        diff["city_id"] = str(selected_city.id)
    if listing.venue_id != selected_venue.id:
        listing.venue_id = selected_venue.id
        diff["venue_id"] = str(selected_venue.id)
    if payload.category is not None:
        listing.category = normalize_optional_text(payload.category)
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
        listing.offer_text = normalize_optional_text(payload.offer_text)
        diff["offer_text"] = listing.offer_text
    if payload.cover_image_url is not None:
        listing.cover_image_url = normalize_optional_text(payload.cover_image_url)
        diff["cover_image_url"] = listing.cover_image_url
    if payload.gallery_image_urls is not None:
        listing.gallery_image_urls = normalize_string_list(payload.gallery_image_urls)
        diff["gallery_image_urls"] = listing.gallery_image_urls or []
    if payload.metadata is not None:
        listing.metadata_json = normalize_json_dict(payload.metadata)
        diff["metadata"] = listing.metadata_json
    if payload.vibe_tags is not None:
        listing.vibe_tags = normalize_string_list(payload.vibe_tags)
        diff["vibe_tags"] = listing.vibe_tags or []

    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="UPDATE_LISTING",
        entity_type="LISTING",
        entity_id=str(listing.id),
        diff=diff,
    )
    await admin_repository.commit(db)
    await admin_repository.refresh(db, listing)

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


async def archive_admin_listing_entry(
    db: AsyncSession,
    *,
    listing_id: UUID,
    admin_user_id: UUID,
) -> dict[str, Any]:
    listing = await admin_repository.get_listing(db, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    now = datetime.now()
    cancelled_occurrences = 0
    cancelled_bookings = 0
    reason = "Occurrence cancelled because listing was archived by admin"
    email_payloads: list[dict[str, Any]] = []
    notifications: list[Notification] = []

    if listing.status != ListingStatus.ARCHIVED:
        listing.status = ListingStatus.ARCHIVED

    occurrence_rows = await admin_repository.list_scheduled_occurrences_for_listing(
        db, listing.id
    )
    for occurrence in occurrence_rows:
        reference_end = occurrence.end_time or occurrence.start_time
        if reference_end is None or reference_end >= now:
            occurrence.status = OccurrenceStatus.CANCELLED
            occurrence.capacity_remaining = occurrence.capacity_total
            cancelled_occurrences += 1

            venue = await admin_repository.get_venue(db, occurrence.venue_id)
            affected_rows = await admin_repository.list_occurrence_bookings_with_user(
                db, occurrence.id
            )
            cancelled_bookings += len(affected_rows)

            for booking, user_name, user_email in affected_rows:
                booking.status = BookingStatus.CANCELLED
                booking.cancellation_reason = reason
                booking.hold_expires_at = None

                listing_snapshot = (
                    booking.listing_snapshot
                    if isinstance(booking.listing_snapshot, dict)
                    else {}
                )
                listing_title = str(
                    listing_snapshot.get("title")
                    or (listing.title if listing else "Your booking")
                )
                venue_name_text = str(
                    listing_snapshot.get("venue_name") or (venue.name if venue else "")
                ).strip()
                start_time_label = (
                    occurrence.start_time.strftime("%a, %d %b %Y %I:%M %p")
                    if occurrence.start_time
                    else "scheduled time"
                )
                venue_fragment = f" at {venue_name_text}" if venue_name_text else ""
                notifications.append(
                    Notification(
                        user_id=booking.user_id,
                        title="Occurrence cancelled",
                        body=(
                            f"Your booking for '{listing_title}' on {start_time_label}{venue_fragment} "
                            f"was cancelled by admin. Reason: {reason}"
                        ),
                        type=NotificationType.BOOKING,
                        reference_id=str(booking.id),
                        is_read=False,
                    )
                )

                if not user_email:
                    continue

                email_payloads.append(
                    {
                        "to_email": str(user_email),
                        "recipient_name": str(user_name or ""),
                        "booking_id": booking.id,
                        "listing_title": listing_title,
                        "start_time": occurrence.start_time,
                        "venue_name": venue_name_text,
                        "venue_address": str(
                            listing_snapshot.get("address")
                            or (venue.address if venue else "")
                        ),
                        "reason": reason,
                        "total_amount": booking.final_price or booking.total_price,
                        "currency": str(listing_snapshot.get("currency") or "INR"),
                    }
                )

    if notifications:
        admin_repository.add_instances(db, notifications)

    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="ARCHIVE_LISTING",
        entity_type="LISTING",
        entity_id=str(listing.id),
        diff={
            "status": ListingStatus.ARCHIVED.value,
            "reason": reason,
            "cancelled_occurrences": cancelled_occurrences,
            "cancelled_bookings": cancelled_bookings,
        },
    )
    await admin_repository.commit(db)

    if email_payloads:
        results = await asyncio.gather(
            *(
                send_occurrence_cancelled_email(
                    to_email=email["to_email"],
                    recipient_name=email["recipient_name"],
                    booking_id=email["booking_id"],
                    listing_title=email["listing_title"],
                    start_time=email["start_time"],
                    venue_name=email["venue_name"],
                    venue_address=email["venue_address"],
                    reason=email["reason"],
                    total_amount=email["total_amount"],
                    currency=email["currency"],
                    fail_silently=True,
                )
                for email in email_payloads
            )
        )
        failed_count = len([result for result in results if not result])
        if failed_count:
            logger.warning(
                "Listing archive cancellation email delivery failed for listing_id=%s (%s/%s failed).",
                listing.id,
                failed_count,
                len(email_payloads),
            )

    return {"message": "Listing archived successfully"}


async def get_admin_occurrences_page(
    db: AsyncSession,
    *,
    listing_id: UUID,
    status: str | None,
    q: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    listing = await admin_repository.get_listing(db, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    status_enum = parse_occurrence_status(status)
    query_text = q.strip() if q and q.strip() else None
    occurrence_uuid = parse_uuid_or_none(query_text)

    rows, total = await admin_repository.list_admin_occurrences(
        db,
        listing_id=listing_id,
        status_enum=status_enum,
        query_text=query_text,
        occurrence_uuid=occurrence_uuid,
        page=page,
        page_size=page_size,
    )
    items = [serialize_occurrence_row(row[0], row[1]) for row in rows]
    return pagination_payload(items, page, page_size, total)


async def create_admin_occurrence_entries(
    db: AsyncSession,
    *,
    listing_id: UUID,
    payload: OccurrenceCreateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    listing = await admin_repository.get_listing(db, listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")
    if listing.status == ListingStatus.ARCHIVED:
        raise_api_error(
            400, "INVALID_REQUEST", "Cannot create occurrences for archived listing"
        )

    listing_city = await admin_repository.get_city(db, listing.city_id)
    allow_cross_city_venues = is_nationwide_city_name(
        listing_city.name if listing_city else None
    )

    created: list[Occurrence] = []
    for entry in payload.occurrences:
        validate_occurrence_window(entry.start_time, entry.end_time)

        venue = await admin_repository.get_venue(db, entry.venue_id)
        if not venue:
            raise_api_error(404, "NOT_FOUND", "Venue not found")
        if not allow_cross_city_venues and venue.city_id != listing.city_id:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"venue_id": "Venue does not belong to listing city"}},
            )

        created.append(
            Occurrence(
                listing_id=listing.id,
                venue_id=venue.id,
                city_id=venue.city_id if allow_cross_city_venues else listing.city_id,
                start_time=entry.start_time,
                end_time=entry.end_time,
                provider_sub_location=normalize_optional_text(entry.provider_sub_location),
                capacity_total=int(entry.capacity_total),
                capacity_remaining=int(entry.capacity_total),
                ticket_pricing=normalize_json_dict(entry.ticket_pricing),
                seat_layout=normalize_seat_layout(entry.seat_layout),
                status=OccurrenceStatus.SCHEDULED,
            )
        )

    admin_repository.add_instances(db, created)
    await admin_repository.flush(db)
    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="CREATE_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(created[0].id),
        diff={"listing_id": str(listing.id), "count": len(created)},
    )
    await admin_repository.commit(db)

    return {
        "message": f"{len(created)} occurrence created successfully",
        "occurrences": [
            {"id": occurrence.id, "status": occurrence.status.value}
            for occurrence in created
        ],
    }


async def update_admin_occurrence_entry(
    db: AsyncSession,
    *,
    occurrence_id: UUID,
    payload: OccurrenceUpdateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    occurrence = await admin_repository.get_occurrence(db, occurrence_id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing = await admin_repository.get_listing(db, occurrence.listing_id)
    if not listing:
        raise_api_error(404, "NOT_FOUND", "Listing not found")

    listing_city = await admin_repository.get_city(db, listing.city_id)
    allow_cross_city_venues = is_nationwide_city_name(
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
    validate_occurrence_window(next_start, next_end)

    diff: dict[str, Any] = {}
    if "start_time" in payload.model_fields_set:
        occurrence.start_time = next_start
        diff["start_time"] = next_start.isoformat()
    if "end_time" in payload.model_fields_set:
        occurrence.end_time = next_end
        diff["end_time"] = next_end.isoformat() if next_end else None

    venue = await admin_repository.get_venue(db, occurrence.venue_id)
    if "venue_id" in payload.model_fields_set:
        if payload.venue_id is None:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"venue_id": "venue_id is required"}},
            )
        next_venue = await admin_repository.get_venue(db, payload.venue_id)
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
        occurrence.provider_sub_location = normalize_optional_text(
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
        occurrence.ticket_pricing = normalize_json_dict(payload.ticket_pricing)
        diff["ticket_pricing"] = occurrence.ticket_pricing

    if "seat_layout" in payload.model_fields_set:
        occurrence.seat_layout = normalize_seat_layout(payload.seat_layout)
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

    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="UPDATE_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(occurrence.id),
        diff=diff,
    )
    await admin_repository.commit(db)
    await admin_repository.refresh(db, occurrence)

    if venue is None:
        venue = await admin_repository.get_venue(db, occurrence.venue_id)

    return {
        "message": "Occurrence updated successfully",
        "occurrence": serialize_occurrence_row(
            occurrence, venue.name if venue else None
        ),
    }


async def cancel_admin_occurrence_entry(
    db: AsyncSession,
    *,
    occurrence_id: UUID,
    payload: OccurrenceCancelRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    occurrence = await admin_repository.get_occurrence(db, occurrence_id)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    listing = await admin_repository.get_listing(db, occurrence.listing_id)
    venue = await admin_repository.get_venue(db, occurrence.venue_id)
    reason = normalize_optional_text(payload.reason) or "Occurrence cancelled by admin"
    if occurrence.status != OccurrenceStatus.CANCELLED:
        occurrence.status = OccurrenceStatus.CANCELLED
    occurrence.capacity_remaining = occurrence.capacity_total

    affected_rows = await admin_repository.list_occurrence_bookings_with_user(
        db, occurrence.id
    )
    email_payloads: list[dict[str, Any]] = []
    notifications: list[Notification] = []
    for booking, user_name, user_email in affected_rows:
        booking.status = BookingStatus.CANCELLED
        booking.cancellation_reason = reason
        booking.hold_expires_at = None

        listing_snapshot = (
            booking.listing_snapshot if isinstance(booking.listing_snapshot, dict) else {}
        )
        listing_title = str(
            listing_snapshot.get("title") or (listing.title if listing else "Your booking")
        )
        venue_name_text = str(
            listing_snapshot.get("venue_name") or (venue.name if venue else "")
        ).strip()
        start_time_label = (
            occurrence.start_time.strftime("%a, %d %b %Y %I:%M %p")
            if occurrence.start_time
            else "scheduled time"
        )
        venue_fragment = f" at {venue_name_text}" if venue_name_text else ""
        notifications.append(
            Notification(
                user_id=booking.user_id,
                title="Occurrence cancelled",
                body=(
                    f"Your booking for '{listing_title}' on {start_time_label}{venue_fragment} "
                    f"was cancelled by admin. Reason: {reason}"
                ),
                type=NotificationType.BOOKING,
                reference_id=str(booking.id),
                is_read=False,
            )
        )

        if not user_email:
            continue

        email_payloads.append(
            {
                "to_email": str(user_email),
                "recipient_name": str(user_name or ""),
                "booking_id": booking.id,
                "listing_title": listing_title,
                "start_time": occurrence.start_time,
                "venue_name": venue_name_text,
                "venue_address": str(
                    listing_snapshot.get("address") or (venue.address if venue else "")
                ),
                "reason": reason,
                "total_amount": booking.final_price or booking.total_price,
                "currency": str(listing_snapshot.get("currency") or "INR"),
            }
        )

    if notifications:
        admin_repository.add_instances(db, notifications)

    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="CANCEL_OCCURRENCE",
        entity_type="OCCURRENCE",
        entity_id=str(occurrence.id),
        diff={"reason": reason, "cancelled_bookings": len(affected_rows)},
    )
    await admin_repository.commit(db)

    if email_payloads:
        results = await asyncio.gather(
            *(
                send_occurrence_cancelled_email(
                    to_email=email["to_email"],
                    recipient_name=email["recipient_name"],
                    booking_id=email["booking_id"],
                    listing_title=email["listing_title"],
                    start_time=email["start_time"],
                    venue_name=email["venue_name"],
                    venue_address=email["venue_address"],
                    reason=email["reason"],
                    total_amount=email["total_amount"],
                    currency=email["currency"],
                    fail_silently=True,
                )
                for email in email_payloads
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


async def get_admin_bookings_page(
    db: AsyncSession,
    *,
    status: str | None,
    date_from: date | None,
    date_to: date | None,
    listing: str | None,
    user: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    status_enum = parse_booking_status(status)
    from_dt = datetime.combine(date_from, time.min) if date_from else None
    to_dt = datetime.combine(date_to, time.max) if date_to else None
    listing_query_text = listing.strip() if listing and listing.strip() else None
    user_query_text = user.strip() if user and user.strip() else None

    rows, total = await admin_repository.list_admin_bookings(
        db,
        status_enum=status_enum,
        from_dt=from_dt,
        to_dt=to_dt,
        listing_query_text=listing_query_text,
        user_query_text=user_query_text,
        page=page,
        page_size=page_size,
    )
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
    return pagination_payload(items, page, page_size, total)


async def get_admin_offers_page(
    db: AsyncSession,
    *,
    is_active: bool | None,
    code: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    code_query_text = code.strip() if code and code.strip() else None
    rows, total = await admin_repository.list_admin_offers(
        db,
        is_active=is_active,
        code_query_text=code_query_text,
        page=page,
        page_size=page_size,
    )
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
    return pagination_payload(items, page, page_size, total)


async def create_admin_offer_entry(
    db: AsyncSession,
    *,
    payload: OfferCreateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    code = payload.code.strip().upper()
    if not code:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"code": "Code is required"}},
        )

    existing = await admin_repository.find_offer_id_by_code_case_insensitive(
        db,
        code=code,
    )
    if existing:
        raise_api_error(409, "DUPLICATE_CODE", "Offer code already exists")

    offer = Offer(
        code=code,
        title=payload.title.strip(),
        description=None,
        discount_type=normalize_discount_type(payload.discount_type),
        discount_value=payload.discount_value,
        min_order_value=payload.min_order_value,
        max_discount_value=payload.max_discount_value,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        usage_limit=normalize_limit(payload.usage_limit),
        user_usage_limit=normalize_limit(payload.user_usage_limit),
        is_active=payload.is_active,
        applicability=payload.applicability or {},
    )
    admin_repository.add_instance(db, offer)
    await admin_repository.flush(db)
    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="CREATE_OFFER",
        entity_type="OFFER",
        entity_id=str(offer.id),
        diff={"code": offer.code, "is_active": offer.is_active},
    )
    await admin_repository.commit(db)
    await admin_repository.refresh(db, offer)

    return {
        "message": "Offer created successfully",
        "offer": {"id": offer.id, "code": offer.code, "is_active": offer.is_active},
    }


async def update_admin_offer_entry(
    db: AsyncSession,
    *,
    offer_id: UUID,
    payload: OfferUpdateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    offer = await admin_repository.get_offer(db, offer_id)
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
        duplicate = await admin_repository.find_offer_id_by_code_case_insensitive(
            db,
            code=code,
            exclude_offer_id=offer.id,
        )
        if duplicate:
            raise_api_error(409, "DUPLICATE_CODE", "Offer code already exists")
        offer.code = code
        diff["code"] = code

    if payload.title is not None:
        offer.title = payload.title.strip()
        diff["title"] = offer.title
    if payload.discount_type is not None:
        offer.discount_type = normalize_discount_type(payload.discount_type)
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
        offer.usage_limit = normalize_limit(payload.usage_limit)
        diff["usage_limit"] = offer.usage_limit
    if payload.user_usage_limit is not None:
        offer.user_usage_limit = normalize_limit(payload.user_usage_limit)
        diff["user_usage_limit"] = offer.user_usage_limit
    if payload.is_active is not None:
        offer.is_active = payload.is_active
        diff["is_active"] = payload.is_active
    if payload.applicability is not None:
        offer.applicability = payload.applicability
        diff["applicability"] = payload.applicability

    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="UPDATE_OFFER",
        entity_type="OFFER",
        entity_id=str(offer.id),
        diff=diff,
    )
    await admin_repository.commit(db)

    return {
        "message": "Offer updated successfully",
        "offer": {"id": offer.id, "code": offer.code, "is_active": offer.is_active},
    }


async def get_admin_audit_logs_page(
    db: AsyncSession,
    *,
    action: str | None,
    entity_type: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    rows, total = await admin_repository.list_admin_audit_logs(
        db,
        action=action,
        entity_type=entity_type,
        page=page,
        page_size=page_size,
    )
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
    return pagination_payload(items, page, page_size, total)


async def create_admin_city_entry(
    db: AsyncSession,
    *,
    payload: CityCreateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"name": "City name is required"}},
        )

    duplicate = await admin_repository.find_city_by_name_case_insensitive(db, name)
    if duplicate:
        raise_api_error(409, "DUPLICATE_CITY", "City already exists")

    city = City(
        name=name,
        state=normalize_optional_text(payload.state),
        image_url=normalize_optional_text(payload.image_url),
        is_active=payload.is_active,
    )
    admin_repository.add_instance(db, city)
    await admin_repository.flush(db)
    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="CREATE_CITY",
        entity_type="CITY",
        entity_id=str(city.id),
        diff={"name": city.name, "state": city.state, "is_active": city.is_active},
    )
    await admin_repository.commit(db)
    return {"message": "City created successfully"}


async def create_admin_venue_entry(
    db: AsyncSession,
    *,
    payload: VenueCreateRequest,
    admin_user_id: UUID,
) -> dict[str, Any]:
    city = await admin_repository.get_city(db, payload.city_id)
    if not city:
        raise_api_error(404, "NOT_FOUND", "City not found")

    normalized_name = payload.name.strip()
    normalized_address = normalize_optional_text(payload.address)
    latitude = payload.latitude
    longitude = payload.longitude

    geocode_used = False
    if normalized_address and (latitude is None or longitude is None):
        geocode_query = build_venue_geocode_query(
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
    admin_repository.add_instance(db, venue)
    await admin_repository.flush(db)
    await add_audit_log(
        db,
        admin_user_id=admin_user_id,
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
    await admin_repository.commit(db)
    await admin_repository.refresh(db, venue)

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

