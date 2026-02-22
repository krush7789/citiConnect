import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.utils.datetime_utils import reference_end_time
from app.models.booking import Booking
from app.models.booking_idempotency import BookingIdempotency
from app.models.enums import (
    BookingStatus,
    DiscountType,
    ListingStatus,
    ListingType,
    OccurrenceStatus,
    SeatLockStatus,
)
from app.models.seat_lock import SeatLock
from app.models.user_offer_usage import UserOfferUsage
from app.repository.booking import (
    count_offer_usage,
    expire_stale_holds,
    expire_stale_seat_locks,
    get_active_locks_for_seats,
    get_booking,
    get_booking_idempotency,
    get_confirmed_bookings_for_occurrence,
    get_listing,
    get_occurrence,
    get_occurrences_by_ids,
    get_offer_by_code,
    get_offer_by_id,
    get_user_active_hold_for_occurrence,
    get_user_active_locks_for_occurrence,
    get_venue,
    list_user_bookings,
)
from app.schema.booking import (
    ApplyOfferRequest,
    BookingCancelResponse,
    BookingItem,
    BookingLockRequest,
    BookingResponse,
    CancelBookingRequest,
    ConfirmBookingRequest,
    RazorpayOrderResponse,
)
from app.schema.common import PaginatedResponse
from app.services.razorpay import (
    create_razorpay_order,
    get_public_key_id,
    get_razorpay_mode,
    is_live_mode,
    verify_payment_signature,
)
from app.utils.pagination import build_paginated_response
from app.utils.pricing import TWO_DP, ticket_price_map
from app.utils.seat_layout import (
    normalize_seat_layout,
    valid_seat_ids_from_layout,
    seat_category_map_from_layout,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])

TAX_RATE = Decimal("0.18")
HOLD_MINUTES = 10


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(TWO_DP, rounding=ROUND_HALF_UP)


def _normalize_seat_ids(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    seats: list[str] = []
    for item in raw:
        if isinstance(item, str):
            seat_id = item.strip().upper()
        elif isinstance(item, dict):
            seat_id = str(item.get("id", "")).strip().upper()
        else:
            seat_id = ""
        if not seat_id or seat_id in seen:
            continue
        seen.add(seat_id)
        seats.append(seat_id)
    return seats


def _extract_confirmed_seats(bookings: list[Booking]) -> set[str]:
    seats: set[str] = set()
    for booking in bookings:
        seats.update(_normalize_seat_ids(booking.booked_seats))
    return seats


def _booking_scope_match(
    scope: str, booking: Booking, occurrence_end: datetime | None, now: datetime
) -> bool:
    if scope == "cancelled":
        return booking.status in {
            BookingStatus.CANCELLED,
            BookingStatus.EXPIRED,
            BookingStatus.FAILED,
        }
    if scope == "past":
        return (
            booking.status == BookingStatus.CONFIRMED
            and occurrence_end is not None
            and occurrence_end < now
        )
    return booking.status in {BookingStatus.HOLD, BookingStatus.CONFIRMED} and (
        occurrence_end is None or occurrence_end >= now
    )


def _base_and_tax_from_breakdown(booking: Booking) -> tuple[Decimal, Decimal]:
    if isinstance(booking.ticket_breakdown, dict):
        base_amount = booking.ticket_breakdown.get("base_amount")
        tax_amount = booking.ticket_breakdown.get("tax_amount")
        if base_amount is not None and tax_amount is not None:
            return _decimal(base_amount), _decimal(tax_amount)

    total = _decimal(booking.total_price or 0)
    base = (total / (Decimal("1.00") + TAX_RATE)).quantize(
        TWO_DP, rounding=ROUND_HALF_UP
    )
    tax = (total - base).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    return base, tax


async def _serialize_booking(
    db: AsyncSession, booking: Booking, now: datetime | None = None
) -> dict[str, Any]:
    reference = now or datetime.now(UTC)
    occurrence = await get_occurrence(db, booking.occurrence_id, for_update=False)
    reference_end = (
        reference_end_time(occurrence.start_time, occurrence.end_time)
        if occurrence
        else None
    )
    hold_active = (
        booking.status == BookingStatus.HOLD
        and booking.hold_expires_at is not None
        and booking.hold_expires_at > reference
    )
    can_cancel = booking.status in {BookingStatus.HOLD, BookingStatus.CONFIRMED} and (
        reference_end is None or reference_end > reference
    )

    applied_offer = None
    if booking.applied_offer_id:
        offer = await get_offer_by_id(db, booking.applied_offer_id)
        if offer:
            applied_offer = {"id": offer.id, "code": offer.code}

    base_amount, tax_amount = _base_and_tax_from_breakdown(booking)

    return {
        "id": booking.id,
        "user_id": booking.user_id,
        "occurrence_id": booking.occurrence_id,
        "listing_snapshot": booking.listing_snapshot,
        "booked_seats": _normalize_seat_ids(booking.booked_seats),
        "ticket_breakdown": booking.ticket_breakdown
        if isinstance(booking.ticket_breakdown, dict)
        else {},
        "quantity": int(booking.quantity or 0),
        "unit_price": booking.unit_price,
        "total_price": booking.total_price,
        "base_amount": base_amount,
        "tax_amount": tax_amount,
        "discount_amount": booking.discount_amount or Decimal("0"),
        "final_price": booking.final_price or booking.total_price,
        "currency": "INR",
        "status": booking.status,
        "payment_provider": booking.payment_provider,
        "payment_ref": booking.payment_ref,
        "cancellation_reason": booking.cancellation_reason,
        "hold_expires_at": booking.hold_expires_at,
        "can_confirm": hold_active,
        "can_cancel": can_cancel,
        "cancellation_deadline": occurrence.start_time
        if can_cancel and occurrence
        else None,
        "created_at": booking.created_at,
        "updated_at": booking.updated_at,
        "applied_offer": applied_offer,
    }


def _occurrence_is_bookable(occurrence, now: datetime) -> bool:
    if occurrence.status != OccurrenceStatus.SCHEDULED:
        return False
    reference_end = reference_end_time(occurrence.start_time, occurrence.end_time)
    return reference_end is None or reference_end >= now


def _normalize_ticket_request_breakdown(raw: Any) -> dict[str, int]:
    source = raw
    if isinstance(source, dict) and isinstance(source.get("tickets"), dict):
        source = source.get("tickets")
    if not isinstance(source, dict):
        return {}

    normalized: dict[str, int] = {}
    for raw_key, raw_value in source.items():
        key = str(raw_key).strip().upper()
        if not key:
            continue
        try:
            quantity = int(raw_value)
        except (TypeError, ValueError):
            continue
        if quantity <= 0:
            continue
        normalized[key] = normalized.get(key, 0) + quantity
    return normalized


def _normalize_text_set(raw: Any, *, uppercase: bool = False) -> set[str]:
    if not isinstance(raw, list):
        return set()

    normalized: set[str] = set()
    for item in raw:
        text = str(item).strip()
        if not text:
            continue
        normalized.add(text.upper() if uppercase else text)
    return normalized


def _extract_razorpay_payload(payment_payload: Any) -> tuple[str, str, str]:
    if not isinstance(payment_payload, dict):
        return "", "", ""
    order_id = str(
        payment_payload.get("razorpay_order_id")
        or payment_payload.get("order_id")
        or ""
    ).strip()
    payment_id = str(
        payment_payload.get("razorpay_payment_id")
        or payment_payload.get("payment_id")
        or ""
    ).strip()
    signature = str(
        payment_payload.get("razorpay_signature")
        or payment_payload.get("signature")
        or ""
    ).strip()
    return order_id, payment_id, signature


def _lock_request_matches_booking(
    booking: Booking, payload: BookingLockRequest, seat_ids: list[str]
) -> bool:
    booking_seats = _normalize_seat_ids(booking.booked_seats)
    if sorted(booking_seats) != sorted(seat_ids):
        return False

    request_breakdown = _normalize_ticket_request_breakdown(payload.ticket_breakdown)
    if request_breakdown:
        booking_breakdown = _normalize_ticket_request_breakdown(
            booking.ticket_breakdown
        )
        if booking_breakdown != request_breakdown:
            return False

    if payload.quantity is not None and int(payload.quantity) != int(
        booking.quantity or 0
    ):
        return False

    return True


def _calculate_price_components(
    *,
    listing_type: ListingType,
    occurrence,
    seat_ids: list[str],
    quantity: int | None,
    ticket_breakdown: dict[str, int] | None,
) -> tuple[Decimal, Decimal, Decimal, int, dict[str, Any]]:
    pricing_map = ticket_price_map(occurrence.ticket_pricing)
    base_amount = Decimal("0")
    normalized_quantity = int(quantity or 1)
    normalized_breakdown = {
        k: int(v) for k, v in (ticket_breakdown or {}).items() if int(v) > 0
    }

    if listing_type == ListingType.MOVIE:
        normalized_quantity = len(seat_ids)
        seat_category_map = seat_category_map_from_layout(occurrence.seat_layout)
        fallback_price = next(iter(pricing_map.values()), Decimal("0"))
        for seat_id in seat_ids:
            category = seat_category_map.get(seat_id.upper())
            base_amount += pricing_map.get(category, fallback_price)
        normalized_breakdown = {"SELECTED": normalized_quantity}
    else:
        fallback_price = next(iter(pricing_map.values()), Decimal("0"))
        default_tier = next(iter(pricing_map.keys()), "STANDARD")

        if normalized_breakdown:
            normalized_tiers: dict[str, int] = {}
            running_total = Decimal("0")
            for raw_tier, qty in normalized_breakdown.items():
                tier = str(raw_tier).strip().upper()
                if not tier or qty <= 0:
                    continue
                normalized_tiers[tier] = normalized_tiers.get(tier, 0) + int(qty)
                tier_price = pricing_map.get(tier, fallback_price)
                running_total += tier_price * Decimal(int(qty))

            normalized_breakdown = normalized_tiers
            normalized_quantity = sum(normalized_tiers.values())
            base_amount = running_total

        if not normalized_breakdown:
            normalized_quantity = max(1, int(quantity or 1))
            normalized_breakdown = {default_tier: normalized_quantity}
            base_amount = pricing_map.get(default_tier, fallback_price) * Decimal(
                normalized_quantity
            )

    tax_amount = (base_amount * TAX_RATE).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    gross_amount = (base_amount + tax_amount).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    return (
        base_amount.quantize(TWO_DP, rounding=ROUND_HALF_UP),
        tax_amount,
        gross_amount,
        normalized_quantity,
        {
            "tickets": normalized_breakdown,
            "base_amount": float(base_amount),
            "tax_amount": float(tax_amount),
            "gross_amount": float(gross_amount),
            "tax_rate": float(TAX_RATE),
        },
    )


@router.post("/locks", response_model=BookingResponse)
async def create_booking_lock(
    payload: BookingLockRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    await asyncio.gather(
        expire_stale_holds(db, now=now), expire_stale_seat_locks(db, now=now)
    )

    occurrence = await get_occurrence(db, payload.occurrence_id, for_update=True)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")
    if not _occurrence_is_bookable(occurrence, now):
        raise_api_error(400, "OCCURRENCE_CANCELLED", "Occurrence is not bookable")

    listing = await get_listing(db, occurrence.listing_id)
    if not listing or listing.status != ListingStatus.PUBLISHED:
        raise_api_error(400, "LISTING_UNAVAILABLE", "Listing is not available")

    seat_ids = _normalize_seat_ids(payload.seat_ids)
    if listing.type == ListingType.MOVIE and not seat_ids:
        raise_api_error(
            422, "INVALID_SEAT_INPUT", "Movie bookings require seat selection"
        )

    existing_hold = await get_user_active_hold_for_occurrence(
        db,
        user_id=current_user.id,
        occurrence_id=occurrence.id,
        now=now,
        for_update=True,
    )
    if existing_hold and _lock_request_matches_booking(
        existing_hold, payload, seat_ids
    ):
        return {"booking": await _serialize_booking(db, existing_hold, now=now)}

    seat_layout = normalize_seat_layout(occurrence.seat_layout)
    current_layout_version = int(seat_layout.get("version", 1))
    if (
        payload.seat_layout_version is not None
        and int(payload.seat_layout_version) != current_layout_version
    ):
        raise_api_error(
            409,
            "SEAT_LAYOUT_VERSION_MISMATCH",
            "Seat map changed. Please refresh.",
            {"current_version": current_layout_version},
        )

    if seat_ids:
        valid_seat_ids = valid_seat_ids_from_layout(seat_layout)
        invalid_seat = next(
            (
                seat
                for seat in seat_ids
                if valid_seat_ids and seat not in valid_seat_ids
            ),
            None,
        )
        if invalid_seat:
            raise_api_error(
                422,
                "INVALID_SEAT_INPUT",
                "Invalid seat selection",
                {"seat_id": invalid_seat},
            )

    if seat_ids:
        confirmed_seat_set = _extract_confirmed_seats(
            await get_confirmed_bookings_for_occurrence(db, occurrence.id)
        )
        unavailable_confirmed = next(
            (seat for seat in seat_ids if seat in confirmed_seat_set), None
        )
        if unavailable_confirmed:
            raise_api_error(
                409,
                "SEAT_UNAVAILABLE",
                "Selected seat is no longer available",
                {"seat_id": unavailable_confirmed},
            )

        active_locks, user_active_locks = await asyncio.gather(
            get_active_locks_for_seats(
                db,
                occurrence_id=occurrence.id,
                seat_ids=seat_ids,
                now=now,
                for_update=True,
            ),
            get_user_active_locks_for_occurrence(
                db,
                occurrence_id=occurrence.id,
                user_id=current_user.id,
                now=now,
                for_update=True,
            ),
        )
        lock_by_seat = {lock.seat_id.upper(): lock for lock in active_locks}
        unavailable_locked = next(
            (
                seat
                for seat in seat_ids
                if seat in lock_by_seat
                and lock_by_seat[seat].user_id != current_user.id
            ),
            None,
        )
        if unavailable_locked:
            raise_api_error(
                409,
                "SEAT_UNAVAILABLE",
                "Selected seat is no longer available",
                {"seat_id": unavailable_locked},
            )

        user_lock_by_seat = {row.seat_id.upper(): row for row in user_active_locks}
        hold_expires_at = now + timedelta(minutes=HOLD_MINUTES)

        for user_lock in user_active_locks:
            if user_lock.seat_id.upper() not in seat_ids:
                user_lock.status = SeatLockStatus.RELEASED

        for seat_id in seat_ids:
            existing = user_lock_by_seat.get(seat_id)
            if existing:
                existing.status = SeatLockStatus.ACTIVE
                existing.expires_at = hold_expires_at
            else:
                db.add(
                    SeatLock(
                        occurrence_id=occurrence.id,
                        seat_id=seat_id,
                        user_id=current_user.id,
                        expires_at=hold_expires_at,
                        status=SeatLockStatus.ACTIVE,
                    )
                )
    else:
        hold_expires_at = now + timedelta(minutes=HOLD_MINUTES)

    if occurrence.capacity_remaining <= 0:
        raise_api_error(
            409, "SOLD_OUT", "No seats/tickets remaining for this occurrence"
        )

    base_amount, tax_amount, gross_amount, normalized_quantity, normalized_breakdown = (
        _calculate_price_components(
            listing_type=listing.type,
            occurrence=occurrence,
            seat_ids=seat_ids,
            quantity=payload.quantity,
            ticket_breakdown=payload.ticket_breakdown,
        )
    )

    if normalized_quantity <= 0:
        raise_api_error(422, "VALIDATION_ERROR", "Quantity must be at least 1")
    if occurrence.capacity_remaining < normalized_quantity:
        raise_api_error(409, "SOLD_OUT", "Insufficient capacity for selected quantity")

    venue = await get_venue(db, occurrence.venue_id)
    listing_snapshot = {
        "listing_id": str(listing.id),
        "title": listing.title,
        "type": listing.type.value,
        "city_id": str(listing.city_id),
        "venue_id": str(occurrence.venue_id),
        "venue_name": venue.name if venue else "",
        "address": venue.address if venue else "",
        "currency": "INR",
    }

    unit_price = (gross_amount / Decimal(max(1, normalized_quantity))).quantize(
        TWO_DP, rounding=ROUND_HALF_UP
    )

    booking = Booking(
        user_id=current_user.id,
        occurrence_id=occurrence.id,
        listing_snapshot=listing_snapshot,
        booked_seats=seat_ids if seat_ids else None,
        ticket_breakdown=normalized_breakdown,
        quantity=normalized_quantity,
        unit_price=unit_price,
        total_price=gross_amount,
        discount_amount=Decimal("0"),
        final_price=gross_amount,
        status=BookingStatus.HOLD,
        hold_expires_at=hold_expires_at,
    )
    db.add(booking)
    await db.flush()
    await db.commit()
    await db.refresh(booking)

    return {"booking": await _serialize_booking(db, booking, now=now)}


@router.patch("/{booking_id}/offer", response_model=BookingResponse)
async def apply_offer_to_booking(
    booking_id: UUID,
    payload: ApplyOfferRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)

    booking = await get_booking(
        db, booking_id, user_id=current_user.id, for_update=True
    )
    if not booking:
        raise_api_error(404, "NOT_FOUND", "Booking not found")
    if booking.status == BookingStatus.EXPIRED:
        raise_api_error(
            400,
            "BOOKING_EXPIRED",
            "Booking hold expired",
            {
                "status": booking.status.value,
                "hold_expires_at": booking.hold_expires_at.isoformat()
                if booking.hold_expires_at
                else None,
                "server_time": now.isoformat(),
            },
        )
    if booking.status != BookingStatus.HOLD:
        raise_api_error(
            400,
            "BOOKING_NOT_PENDING",
            "Booking is not in HOLD",
            {"status": booking.status.value},
        )
    if booking.hold_expires_at and booking.hold_expires_at <= now:
        booking.status = BookingStatus.EXPIRED
        await db.commit()
        raise_api_error(
            400,
            "BOOKING_EXPIRED",
            "Booking hold expired",
            {
                "status": BookingStatus.EXPIRED.value,
                "hold_expires_at": booking.hold_expires_at.isoformat(),
                "server_time": now.isoformat(),
            },
        )

    code = (payload.coupon_code or "").strip()
    if not code:
        booking.applied_offer_id = None
        booking.discount_amount = Decimal("0")
        booking.final_price = booking.total_price
        await db.commit()
        await db.refresh(booking)
        return {"booking": await _serialize_booking(db, booking, now=now)}

    offer = await get_offer_by_code(db, code)
    if not offer:
        raise_api_error(400, "OFFER_INVALID", "Coupon code is invalid")
    if not offer.is_active:
        raise_api_error(400, "OFFER_NOT_APPLICABLE", "Offer is inactive")
    if offer.valid_from and now < offer.valid_from:
        raise_api_error(400, "OFFER_NOT_APPLICABLE", "Offer is not active yet")
    if offer.valid_until and now > offer.valid_until:
        raise_api_error(400, "OFFER_NOT_APPLICABLE", "Offer has expired")

    listing = None
    listing_id_raw = (booking.listing_snapshot or {}).get("listing_id")
    if listing_id_raw:
        try:
            listing = await get_listing(db, UUID(str(listing_id_raw)))
        except (TypeError, ValueError):
            listing = None
    applicability = offer.applicability if isinstance(offer.applicability, dict) else {}
    if listing:
        allowed_types = _normalize_text_set(applicability.get("types"), uppercase=True)
        if allowed_types and listing.type.value.upper() not in allowed_types:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "Offer not applicable for this listing type",
                {
                    "offer_code": offer.code,
                    "listing_type": listing.type.value,
                    "allowed_types": sorted(allowed_types),
                },
            )

        allowed_listing_ids = _normalize_text_set(applicability.get("listing_ids"))
        if allowed_listing_ids and str(listing.id) not in allowed_listing_ids:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "Offer not applicable for this listing",
                {
                    "offer_code": offer.code,
                    "listing_id": str(listing.id),
                },
            )

        allowed_categories = _normalize_text_set(
            applicability.get("categories"), uppercase=True
        )
        listing_category = (listing.category or "").strip()
        if allowed_categories and listing_category.upper() not in allowed_categories:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "Offer not applicable for this category",
                {
                    "offer_code": offer.code,
                    "listing_category": listing_category,
                    "allowed_categories": sorted(allowed_categories),
                },
            )

        allowed_city_ids = _normalize_text_set(applicability.get("city_ids"))
        if allowed_city_ids and str(listing.city_id) not in allowed_city_ids:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "Offer not applicable for this city",
                {
                    "offer_code": offer.code,
                    "city_id": str(listing.city_id),
                },
            )

    total_price = _decimal(booking.total_price or 0)
    min_order_value = _decimal(offer.min_order_value or 0)
    if total_price < min_order_value:
        raise_api_error(
            400,
            "OFFER_NOT_APPLICABLE",
            "Minimum order value not met",
            {
                "offer_code": offer.code,
                "min_order_value": float(min_order_value),
                "booking_total_price": float(total_price),
            },
        )

    if offer.usage_limit is not None:
        total_usage = await count_offer_usage(db, offer.id)
        if total_usage >= offer.usage_limit:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "Offer usage limit reached",
                {
                    "offer_code": offer.code,
                    "usage_limit": int(offer.usage_limit),
                    "current_total_usage": int(total_usage),
                },
            )

    if offer.user_usage_limit is not None:
        user_usage = await count_offer_usage(db, offer.id, user_id=current_user.id)
        if user_usage >= offer.user_usage_limit:
            raise_api_error(
                400,
                "OFFER_NOT_APPLICABLE",
                "User offer usage limit reached",
                {
                    "offer_code": offer.code,
                    "user_usage_limit": int(offer.user_usage_limit),
                    "current_user_usage": int(user_usage),
                },
            )

    discount_amount = Decimal("0")
    discount_value = _decimal(offer.discount_value)
    if offer.discount_type == DiscountType.FLAT:
        discount_amount = discount_value
    else:
        discount_amount = (total_price * discount_value / Decimal("100")).quantize(
            TWO_DP, rounding=ROUND_HALF_UP
        )

    if offer.max_discount_value is not None:
        discount_amount = min(discount_amount, _decimal(offer.max_discount_value))

    discount_amount = min(discount_amount, total_price)
    final_price = (total_price - discount_amount).quantize(
        TWO_DP, rounding=ROUND_HALF_UP
    )

    booking.applied_offer_id = offer.id
    booking.discount_amount = discount_amount
    booking.final_price = final_price

    await db.commit()
    await db.refresh(booking)
    return {"booking": await _serialize_booking(db, booking, now=now)}


@router.post(
    "/{booking_id}/payments/razorpay/order", response_model=RazorpayOrderResponse
)
async def create_razorpay_payment_order(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)

    booking = await get_booking(
        db, booking_id, user_id=current_user.id, for_update=True
    )
    if not booking:
        raise_api_error(404, "NOT_FOUND", "Booking not found")
    if booking.status == BookingStatus.EXPIRED:
        raise_api_error(400, "BOOKING_EXPIRED", "Booking hold expired")
    if booking.status != BookingStatus.HOLD:
        raise_api_error(400, "BOOKING_NOT_PENDING", "Booking is not in HOLD")
    if booking.hold_expires_at and booking.hold_expires_at <= now:
        booking.status = BookingStatus.EXPIRED
        await db.commit()
        raise_api_error(400, "BOOKING_EXPIRED", "Booking hold expired")

    amount = int(
        (
            _decimal(booking.final_price or booking.total_price or 0) * Decimal("100")
        ).to_integral_value()
    )
    if amount <= 0:
        raise_api_error(400, "VALIDATION_ERROR", "Booking has invalid payable amount")

    order_payload = await create_razorpay_order(
        amount_paise=amount,
        currency="INR",
        receipt=f"booking_{str(booking.id).replace('-', '')[:30]}",
        notes={
            "booking_id": str(booking.id),
            "user_id": str(current_user.id),
        },
    )

    snapshot_source = (
        booking.listing_snapshot if isinstance(booking.listing_snapshot, dict) else {}
    )
    snapshot = dict(snapshot_source)
    snapshot["payment_order_id"] = order_payload["id"]
    snapshot["payment_order_created_at"] = now.isoformat()
    booking.listing_snapshot = snapshot
    await db.commit()

    return {
        "payment": {
            "key_id": get_public_key_id(),
            "order_id": order_payload["id"],
            "amount": int(order_payload["amount"]),
            "currency": str(order_payload.get("currency") or "INR").upper(),
            "booking_id": booking.id,
            "mode": get_razorpay_mode(),
        }
    }


@router.post("/{booking_id}/confirm", response_model=BookingResponse)
async def confirm_booking(
    booking_id: UUID,
    payload: ConfirmBookingRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    if not x_idempotency_key:
        raise_api_error(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency key is required")

    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)
    await expire_stale_seat_locks(db, now=now)

    existing_idempotency = await get_booking_idempotency(db, x_idempotency_key)
    if existing_idempotency:
        existing_booking = await get_booking(
            db,
            existing_idempotency.booking_id,
            user_id=current_user.id,
            for_update=False,
        )
        if existing_booking:
            return {"booking": await _serialize_booking(db, existing_booking, now=now)}
        raise_api_error(
            403, "FORBIDDEN", "Idempotency key does not belong to this user"
        )

    booking = await get_booking(
        db, booking_id, user_id=current_user.id, for_update=True
    )
    if not booking:
        raise_api_error(404, "NOT_FOUND", "Booking not found")
    if booking.status == BookingStatus.EXPIRED:
        raise_api_error(400, "BOOKING_EXPIRED", "Booking hold expired")
    if booking.status != BookingStatus.HOLD:
        raise_api_error(400, "BOOKING_NOT_PENDING", "Booking is not in HOLD")
    if booking.hold_expires_at and booking.hold_expires_at <= now:
        booking.status = BookingStatus.EXPIRED
        await db.commit()
        raise_api_error(400, "BOOKING_EXPIRED", "Booking hold expired")

    occurrence = await get_occurrence(db, booking.occurrence_id, for_update=True)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")
    if not _occurrence_is_bookable(occurrence, now):
        raise_api_error(400, "OCCURRENCE_CANCELLED", "Occurrence is not bookable")

    listing = await get_listing(db, occurrence.listing_id)
    if not listing or listing.status != ListingStatus.PUBLISHED:
        raise_api_error(400, "LISTING_UNAVAILABLE", "Listing is not available")

    if listing.type == ListingType.MOVIE:
        seat_ids = _normalize_seat_ids(booking.booked_seats)
        if not seat_ids:
            raise_api_error(
                400, "INVALID_SEAT_INPUT", "Movie booking has no selected seats"
            )

        confirmed_seat_set = _extract_confirmed_seats(
            await get_confirmed_bookings_for_occurrence(db, occurrence.id)
        )
        conflict_confirmed = next(
            (seat for seat in seat_ids if seat in confirmed_seat_set), None
        )
        if conflict_confirmed:
            raise_api_error(
                409,
                "SEAT_UNAVAILABLE",
                "Selected seat is no longer available",
                {"seat_id": conflict_confirmed},
            )

        active_locks = await get_active_locks_for_seats(
            db,
            occurrence_id=occurrence.id,
            seat_ids=seat_ids,
            now=now,
            for_update=True,
        )
        locks_by_seat = {lock.seat_id.upper(): lock for lock in active_locks}
        missing_lock = next(
            (
                seat
                for seat in seat_ids
                if seat not in locks_by_seat
                or locks_by_seat[seat].user_id != current_user.id
                or locks_by_seat[seat].status != SeatLockStatus.ACTIVE
                or locks_by_seat[seat].expires_at <= now
            ),
            None,
        )
        if missing_lock:
            raise_api_error(
                409,
                "SEAT_UNAVAILABLE",
                "Selected seat is no longer available",
                {"seat_id": missing_lock},
            )

        for seat_id in seat_ids:
            locks_by_seat[seat_id].status = SeatLockStatus.RELEASED

    if occurrence.capacity_remaining < booking.quantity:
        raise_api_error(409, "SOLD_OUT", "Insufficient capacity for this occurrence")

    occurrence.capacity_remaining = max(
        0, occurrence.capacity_remaining - booking.quantity
    )
    if occurrence.capacity_remaining == 0:
        occurrence.status = OccurrenceStatus.SOLD_OUT

    payment_method = (payload.payment_method or "RAZORPAY_DUMMY").strip().upper()
    payment_payload = (
        payload.payment_payload if isinstance(payload.payment_payload, dict) else {}
    )
    if payment_method.startswith("RAZORPAY"):
        order_id, payment_id, signature = _extract_razorpay_payload(payment_payload)

        snapshot = (
            booking.listing_snapshot
            if isinstance(booking.listing_snapshot, dict)
            else {}
        )
        expected_order_id = str(snapshot.get("payment_order_id") or "").strip()
        if expected_order_id and order_id and expected_order_id != order_id:
            raise_api_error(
                400,
                "PAYMENT_VALIDATION_FAILED",
                "Payment order mismatch for this booking.",
                {
                    "expected_order_id": expected_order_id,
                    "received_order_id": order_id,
                },
            )

        live_mode = is_live_mode()
        if live_mode and (not order_id or not payment_id or not signature):
            raise_api_error(
                400,
                "PAYMENT_VALIDATION_FAILED",
                "Missing Razorpay payment details.",
            )
        if not verify_payment_signature(
            order_id=order_id, payment_id=payment_id, signature=signature
        ):
            raise_api_error(
                400,
                "PAYMENT_VALIDATION_FAILED",
                "Invalid Razorpay payment signature.",
            )

        booking.payment_provider = "RAZORPAY"
        booking.payment_ref = payment_id or f"pay_{uuid4().hex[:20]}"
    else:
        booking.payment_provider = payment_method or "MOCK"
        booking.payment_ref = f"pay_{uuid4().hex[:20]}"

    booking.status = BookingStatus.CONFIRMED
    booking.hold_expires_at = None

    if booking.applied_offer_id:
        db.add(
            UserOfferUsage(
                user_id=current_user.id,
                offer_id=booking.applied_offer_id,
                booking_id=booking.id,
                used_at=now,
            )
        )

    db.add(BookingIdempotency(key=x_idempotency_key, booking_id=booking.id))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing_after_conflict = await get_booking_idempotency(db, x_idempotency_key)
        if existing_after_conflict:
            existing_booking = await get_booking(
                db,
                existing_after_conflict.booking_id,
                user_id=current_user.id,
                for_update=False,
            )
            if existing_booking:
                return {
                    "booking": await _serialize_booking(db, existing_booking, now=now)
                }
        raise_api_error(
            409, "CONFLICT", "Unable to confirm booking due to a concurrent update"
        )

    await db.refresh(booking)
    return {"booking": await _serialize_booking(db, booking, now=now)}


@router.get("", response_model=PaginatedResponse[BookingItem])
async def get_bookings(
    scope: str = Query(default="upcoming"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if scope not in {"upcoming", "past", "cancelled"}:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"scope": "Invalid scope"}},
        )

    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)
    await db.commit()

    bookings = await list_user_bookings(db, user_id=current_user.id)
    occurrences = await get_occurrences_by_ids(
        db, [booking.occurrence_id for booking in bookings]
    )

    scoped = []
    for booking in bookings:
        occurrence = occurrences.get(booking.occurrence_id)
        reference_end = (
            reference_end_time(occurrence.start_time, occurrence.end_time)
            if occurrence
            else None
        )
        if _booking_scope_match(scope, booking, reference_end, now):
            scoped.append(booking)

    total = len(scoped)
    paged = scoped[(page - 1) * page_size : page * page_size]
    items = [await _serialize_booking(db, booking, now=now) for booking in paged]
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_by_id(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)
    await db.commit()

    booking = await get_booking(
        db, booking_id, user_id=current_user.id, for_update=False
    )
    if not booking:
        raise_api_error(404, "NOT_FOUND", "Booking not found")
    return {"booking": await _serialize_booking(db, booking, now=now)}


@router.patch("/{booking_id}/cancel", response_model=BookingCancelResponse)
async def cancel_booking(
    booking_id: UUID,
    payload: CancelBookingRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    await expire_stale_holds(db, now=now)
    await expire_stale_seat_locks(db, now=now)

    booking = await get_booking(
        db, booking_id, user_id=current_user.id, for_update=True
    )
    if not booking:
        raise_api_error(404, "NOT_FOUND", "Booking not found")
    if booking.status not in {BookingStatus.HOLD, BookingStatus.CONFIRMED}:
        raise_api_error(400, "ALREADY_CANCELLED", "Booking already cancelled")

    occurrence = await get_occurrence(db, booking.occurrence_id, for_update=True)
    if not occurrence:
        raise_api_error(404, "NOT_FOUND", "Occurrence not found")

    if booking.status == BookingStatus.HOLD:
        seat_ids = _normalize_seat_ids(booking.booked_seats)
        if seat_ids:
            locks = await get_active_locks_for_seats(
                db,
                occurrence_id=occurrence.id,
                seat_ids=seat_ids,
                now=now,
                for_update=True,
            )
            for lock in locks:
                if lock.user_id == current_user.id:
                    lock.status = SeatLockStatus.RELEASED
    elif booking.status == BookingStatus.CONFIRMED:
        occurrence.capacity_remaining = min(
            occurrence.capacity_total,
            occurrence.capacity_remaining + int(booking.quantity or 0),
        )
        if (
            occurrence.status == OccurrenceStatus.SOLD_OUT
            and occurrence.capacity_remaining > 0
        ):
            occurrence.status = OccurrenceStatus.SCHEDULED

    booking.status = BookingStatus.CANCELLED
    booking.cancellation_reason = payload.reason or "User cancelled"
    booking.hold_expires_at = None

    await db.commit()
    return {
        "message": "Booking cancelled successfully",
        "booking_id": booking.id,
        "refund_status": "MOCK_REFUNDED",
    }
