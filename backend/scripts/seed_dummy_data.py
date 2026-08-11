from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
import sys

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure `app.*` imports work whether the script is run from repo root or backend dir.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import _ensure_engine, create_tables
from app.core.security import hash_password
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.booking_idempotency import BookingIdempotency
from app.models.city import City
from app.models.enums import (
    BookingStatus,
    DiscountType,
    ListingStatus,
    ListingType,
    NotificationType,
    OccurrenceStatus,
    SeatLockStatus,
    UserRole,
    VenueType,
)
from app.models.listing import Listing
from app.models.notification import Notification
from app.models.occurrence import Occurrence
from app.models.offer import Offer
from app.models.seat_lock import SeatLock
from app.models.user import User
from app.models.user_offer_usage import UserOfferUsage
from app.models.venue import Venue
from app.models.wishlist import Wishlist


@dataclass
class SeedRefs:
    admin_user: User
    user_alice: User
    user_bob: User
    city_mumbai: City
    city_bengaluru: City
    venue_movie: Venue
    venue_event: Venue
    venue_restaurant: Venue
    venue_activity: Venue
    listing_movie: Listing
    listing_event: Listing
    listing_restaurant: Listing
    listing_activity: Listing
    occurrence_movie: Occurrence
    occurrence_event: Occurrence
    occurrence_restaurant: Occurrence
    occurrence_activity: Occurrence
    offer_welcome20: Offer
    offer_flat150: Offer
    booking_confirmed_movie: Booking
    booking_hold_movie: Booking


def _utc_at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    today_utc = datetime.now(UTC).date()
    return datetime.combine(
        today_utc + timedelta(days=day_offset),
        time(hour=hour, minute=minute, tzinfo=UTC),
    )


def _movie_seat_layout() -> dict:
    rows = ["A", "B", "C", "D"]
    columns = 8
    seat_category_map: dict[str, str] = {}
    for row in rows:
        for col in range(1, columns + 1):
            seat_id = f"{row}{col}"
            seat_category_map[seat_id] = "PREMIUM" if row in {"A", "B"} else "STANDARD"
    return {
        "version": 1,
        "rows": rows,
        "columns": columns,
        "aisles_after": [3],
        "seat_category_map": seat_category_map,
    }


async def _first(db: AsyncSession, stmt):
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_or_create_city(
    db: AsyncSession,
    *,
    name: str,
    state: str,
    image_url: str | None = None,
) -> City:
    city = await _first(db, select(City).where(func.lower(City.name) == name.lower()))
    if city:
        return city
    city = City(name=name, state=state, image_url=image_url, is_active=True)
    db.add(city)
    await db.flush()
    return city


async def _get_or_create_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    role: UserRole,
    phone: str | None,
) -> User:
    user = await _first(db, select(User).where(func.lower(User.email) == email.lower()))
    if user:
        return user
    user = User(
        name=name,
        email=email.lower().strip(),
        password_hash=hash_password(password),
        role=role,
        phone=phone,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _get_or_create_venue(
    db: AsyncSession,
    *,
    city_id,
    name: str,
    venue_type: VenueType,
    address: str,
    latitude: float | None,
    longitude: float | None,
) -> Venue:
    venue = await _first(
        db,
        select(Venue).where(
            Venue.city_id == city_id,
            func.lower(Venue.name) == name.lower(),
        ),
    )
    if venue:
        return venue
    venue = Venue(
        city_id=city_id,
        name=name,
        venue_type=venue_type,
        address=address,
        latitude=latitude,
        longitude=longitude,
        is_active=True,
    )
    db.add(venue)
    await db.flush()
    return venue


async def _get_or_create_listing(
    db: AsyncSession,
    *,
    listing_type: ListingType,
    title: str,
    description: str,
    city_id,
    venue_id,
    created_by,
    price_min: Decimal,
    price_max: Decimal,
    category: str,
    cover_image_url: str,
    gallery_image_urls: list[str],
    offer_text: str,
    vibe_tags: list[str],
    metadata_json: dict,
    is_featured: bool,
) -> Listing:
    listing = await _first(
        db,
        select(Listing).where(
            Listing.type == listing_type,
            func.lower(Listing.title) == title.lower(),
        ),
    )
    if listing:
        return listing
    listing = Listing(
        type=listing_type,
        title=title,
        description=description,
        city_id=city_id,
        venue_id=venue_id,
        created_by=created_by,
        price_min=price_min,
        price_max=price_max,
        category=category,
        cover_image_url=cover_image_url,
        gallery_image_urls=gallery_image_urls,
        offer_text=offer_text,
        vibe_tags=vibe_tags,
        metadata_json=metadata_json,
        is_featured=is_featured,
        popularity_score=0.0,
        status=ListingStatus.PUBLISHED,
    )
    db.add(listing)
    await db.flush()
    return listing


async def _get_or_create_occurrence(
    db: AsyncSession,
    *,
    listing_id,
    venue_id,
    city_id,
    provider_sub_location: str,
    start_time: datetime,
    end_time: datetime | None,
    capacity_total: int,
    capacity_remaining: int,
    ticket_pricing: dict,
    seat_layout: dict | None,
) -> Occurrence:
    occurrence = await _first(
        db,
        select(Occurrence).where(
            Occurrence.listing_id == listing_id,
            Occurrence.provider_sub_location == provider_sub_location,
            Occurrence.start_time == start_time,
        ),
    )
    if occurrence:
        return occurrence
    occurrence = Occurrence(
        listing_id=listing_id,
        venue_id=venue_id,
        city_id=city_id,
        provider_sub_location=provider_sub_location,
        start_time=start_time,
        end_time=end_time,
        capacity_total=capacity_total,
        capacity_remaining=capacity_remaining,
        ticket_pricing=ticket_pricing,
        seat_layout=seat_layout,
        status=OccurrenceStatus.SCHEDULED,
    )
    db.add(occurrence)
    await db.flush()
    return occurrence


async def _get_or_create_offer(
    db: AsyncSession,
    *,
    code: str,
    title: str,
    description: str,
    discount_type: DiscountType,
    discount_value: Decimal,
    min_order_value: Decimal | None,
    max_discount_value: Decimal | None,
    valid_from: datetime,
    valid_until: datetime,
    usage_limit: int | None,
    user_usage_limit: int | None,
    applicability: dict,
) -> Offer:
    offer = await _first(db, select(Offer).where(func.lower(Offer.code) == code.lower()))
    if offer:
        return offer
    offer = Offer(
        code=code,
        title=title,
        description=description,
        discount_type=discount_type,
        discount_value=discount_value,
        min_order_value=min_order_value,
        max_discount_value=max_discount_value,
        valid_from=valid_from,
        valid_until=valid_until,
        usage_limit=usage_limit,
        user_usage_limit=user_usage_limit,
        is_active=True,
        applicability=applicability,
    )
    db.add(offer)
    await db.flush()
    return offer


async def _get_or_create_booking(
    db: AsyncSession,
    *,
    user_id,
    occurrence_id,
    status: BookingStatus,
    quantity: int,
    unit_price: Decimal,
    total_price: Decimal,
    final_price: Decimal,
    discount_amount: Decimal,
    listing_snapshot: dict,
    booked_seats: list[str] | None,
    ticket_breakdown: dict,
    applied_offer_id=None,
    payment_provider: str | None = None,
    payment_ref: str | None = None,
    hold_expires_at: datetime | None = None,
) -> Booking:
    booking = await _first(
        db,
        select(Booking).where(
            Booking.user_id == user_id,
            Booking.occurrence_id == occurrence_id,
            Booking.status == status,
            Booking.quantity == quantity,
        ),
    )
    if booking:
        return booking
    booking = Booking(
        user_id=user_id,
        occurrence_id=occurrence_id,
        status=status,
        quantity=quantity,
        unit_price=unit_price,
        total_price=total_price,
        final_price=final_price,
        discount_amount=discount_amount,
        listing_snapshot=listing_snapshot,
        booked_seats=booked_seats,
        ticket_breakdown=ticket_breakdown,
        applied_offer_id=applied_offer_id,
        payment_provider=payment_provider,
        payment_ref=payment_ref,
        hold_expires_at=hold_expires_at,
    )
    db.add(booking)
    await db.flush()
    return booking


async def _get_or_create_wishlist(db: AsyncSession, *, user_id, listing_id) -> Wishlist:
    wishlist = await _first(
        db,
        select(Wishlist).where(
            Wishlist.user_id == user_id,
            Wishlist.listing_id == listing_id,
        ),
    )
    if wishlist:
        return wishlist
    wishlist = Wishlist(user_id=user_id, listing_id=listing_id)
    db.add(wishlist)
    await db.flush()
    return wishlist


async def _get_or_create_notification(
    db: AsyncSession,
    *,
    user_id,
    title: str,
    body: str,
    notification_type: NotificationType,
    reference_id: str | None = None,
) -> Notification:
    notification = await _first(
        db,
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.title == title,
            Notification.body == body,
            Notification.type == notification_type,
        ),
    )
    if notification:
        return notification
    notification = Notification(
        user_id=user_id,
        title=title,
        body=body,
        type=notification_type,
        reference_id=reference_id,
        is_read=False,
    )
    db.add(notification)
    await db.flush()
    return notification


async def _get_or_create_seat_lock(
    db: AsyncSession,
    *,
    occurrence_id,
    user_id,
    seat_id: str,
    expires_at: datetime,
    status: SeatLockStatus,
) -> SeatLock:
    seat_lock = await _first(
        db,
        select(SeatLock).where(
            SeatLock.occurrence_id == occurrence_id,
            SeatLock.user_id == user_id,
            SeatLock.seat_id == seat_id,
            SeatLock.status == status,
        ),
    )
    if seat_lock:
        return seat_lock
    seat_lock = SeatLock(
        occurrence_id=occurrence_id,
        user_id=user_id,
        seat_id=seat_id,
        expires_at=expires_at,
        status=status,
    )
    db.add(seat_lock)
    await db.flush()
    return seat_lock


async def _get_or_create_offer_usage(
    db: AsyncSession,
    *,
    user_id,
    offer_id,
    booking_id,
    used_at: datetime,
) -> UserOfferUsage:
    usage = await _first(
        db,
        select(UserOfferUsage).where(
            UserOfferUsage.user_id == user_id,
            UserOfferUsage.offer_id == offer_id,
            UserOfferUsage.booking_id == booking_id,
        ),
    )
    if usage:
        return usage
    usage = UserOfferUsage(
        user_id=user_id,
        offer_id=offer_id,
        booking_id=booking_id,
        used_at=used_at,
    )
    db.add(usage)
    await db.flush()
    return usage


async def _get_or_create_idempotency_key(
    db: AsyncSession,
    *,
    key: str,
    booking_id,
) -> BookingIdempotency:
    row = await _first(db, select(BookingIdempotency).where(BookingIdempotency.key == key))
    if row:
        return row
    row = BookingIdempotency(key=key, booking_id=booking_id)
    db.add(row)
    await db.flush()
    return row


async def _get_or_create_audit_log(
    db: AsyncSession,
    *,
    admin_user_id,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict,
) -> AdminAuditLog:
    row = await _first(
        db,
        select(AdminAuditLog).where(
            AdminAuditLog.admin_user_id == admin_user_id,
            AdminAuditLog.action == action,
            AdminAuditLog.entity_type == entity_type,
            AdminAuditLog.entity_id == entity_id,
        ),
    )
    if row:
        return row
    row = AdminAuditLog(
        admin_user_id=admin_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff=diff,
    )
    db.add(row)
    await db.flush()
    return row


async def _seed_entities(db: AsyncSession) -> SeedRefs:
    # Users
    admin_user = await _get_or_create_user(
        db,
        name="CitiConnect Admin",
        email="admin@citiconnect.dev",
        password="Admin@12345",
        role=UserRole.ADMIN,
        phone="+919900000001",
    )
    user_alice = await _get_or_create_user(
        db,
        name="Alice Mehta",
        email="alice@citiconnect.dev",
        password="Alice@12345",
        role=UserRole.USER,
        phone="+919900000002",
    )
    user_bob = await _get_or_create_user(
        db,
        name="Bob Sharma",
        email="bob@citiconnect.dev",
        password="Bob@12345",
        role=UserRole.USER,
        phone="+919900000003",
    )

    # Cities
    city_mumbai = await _get_or_create_city(
        db,
        name="Mumbai",
        state="Maharashtra",
        image_url="https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7",
    )
    city_bengaluru = await _get_or_create_city(
        db,
        name="Bengaluru",
        state="Karnataka",
        image_url="https://images.unsplash.com/photo-1596176530529-78163a4f7af2",
    )

    # Venues
    venue_movie = await _get_or_create_venue(
        db,
        city_id=city_mumbai.id,
        name="PVR Phoenix Marketcity",
        venue_type=VenueType.THEATER,
        address="Kurla West, Mumbai, Maharashtra",
        latitude=19.0869,
        longitude=72.8890,
    )
    venue_event = await _get_or_create_venue(
        db,
        city_id=city_mumbai.id,
        name="NESCO Exhibition Centre",
        venue_type=VenueType.EVENT_SPACE,
        address="Goregaon East, Mumbai, Maharashtra",
        latitude=19.1551,
        longitude=72.8532,
    )
    venue_restaurant = await _get_or_create_venue(
        db,
        city_id=city_bengaluru.id,
        name="Skyline Bistro Indiranagar",
        venue_type=VenueType.RESTAURANT,
        address="100 Feet Road, Indiranagar, Bengaluru",
        latitude=12.9716,
        longitude=77.6412,
    )
    venue_activity = await _get_or_create_venue(
        db,
        city_id=city_bengaluru.id,
        name="Urban Adventure Arena",
        venue_type=VenueType.ACTIVITY_AREA,
        address="Whitefield Main Road, Bengaluru",
        latitude=12.9698,
        longitude=77.7499,
    )

    # Listings
    listing_movie = await _get_or_create_listing(
        db,
        listing_type=ListingType.MOVIE,
        title="Interstellar Re-Release",
        description="Special IMAX re-release with enhanced sound.",
        city_id=city_mumbai.id,
        venue_id=venue_movie.id,
        created_by=admin_user.id,
        price_min=Decimal("220.00"),
        price_max=Decimal("320.00"),
        category="Sci-Fi",
        cover_image_url="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba",
        gallery_image_urls=[
            "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba",
            "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c",
        ],
        offer_text="20% off on first movie booking",
        vibe_tags=["IMAX", "SCI_FI", "BLOCKBUSTER"],
        metadata_json={"language": "English", "duration_min": 169},
        is_featured=True,
    )
    listing_event = await _get_or_create_listing(
        db,
        listing_type=ListingType.EVENT,
        title="Mumbai Tech Summit 2026",
        description="A one-day summit on AI, Cloud, and Product Engineering.",
        city_id=city_mumbai.id,
        venue_id=venue_event.id,
        created_by=admin_user.id,
        price_min=Decimal("999.00"),
        price_max=Decimal("2499.00"),
        category="Technology",
        cover_image_url="https://images.unsplash.com/photo-1511578314322-379afb476865",
        gallery_image_urls=[
            "https://images.unsplash.com/photo-1511578314322-379afb476865",
        ],
        offer_text="Flat INR 150 off on early booking",
        vibe_tags=["NETWORKING", "TALKS", "STARTUPS"],
        metadata_json={"dress_code": "Business Casual"},
        is_featured=True,
    )
    listing_restaurant = await _get_or_create_listing(
        db,
        listing_type=ListingType.RESTAURANT,
        title="Skyline Sunset Dining",
        description="Curated rooftop fine dining experience with live jazz.",
        city_id=city_bengaluru.id,
        venue_id=venue_restaurant.id,
        created_by=admin_user.id,
        price_min=Decimal("1200.00"),
        price_max=Decimal("2200.00"),
        category="Fine Dining",
        cover_image_url="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
        gallery_image_urls=[
            "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
        ],
        offer_text="Complimentary dessert for couples",
        vibe_tags=["ROOFTOP", "LIVE_MUSIC", "COUPLE"],
        metadata_json={"cuisine": "Continental"},
        is_featured=False,
    )
    listing_activity = await _get_or_create_listing(
        db,
        listing_type=ListingType.ACTIVITY,
        title="Indoor Go-Kart Challenge",
        description="High-speed indoor karting track with timed laps.",
        city_id=city_bengaluru.id,
        venue_id=venue_activity.id,
        created_by=admin_user.id,
        price_min=Decimal("750.00"),
        price_max=Decimal("1200.00"),
        category="Adventure",
        cover_image_url="https://images.unsplash.com/photo-1511886929837-354d827aae26",
        gallery_image_urls=[
            "https://images.unsplash.com/photo-1511886929837-354d827aae26",
        ],
        offer_text="Weekday special pricing",
        vibe_tags=["RACING", "TEAM_FUN", "ADRENALINE"],
        metadata_json={"min_age": 14},
        is_featured=False,
    )

    # Occurrences
    occurrence_movie = await _get_or_create_occurrence(
        db,
        listing_id=listing_movie.id,
        venue_id=venue_movie.id,
        city_id=city_mumbai.id,
        provider_sub_location="SCREEN_1",
        start_time=_utc_at(2, 13, 0),
        end_time=_utc_at(2, 16, 0),
        capacity_total=32,
        capacity_remaining=27,
        ticket_pricing={"PREMIUM": 320, "STANDARD": 220},
        seat_layout=_movie_seat_layout(),
    )
    occurrence_event = await _get_or_create_occurrence(
        db,
        listing_id=listing_event.id,
        venue_id=venue_event.id,
        city_id=city_mumbai.id,
        provider_sub_location="HALL_A",
        start_time=_utc_at(5, 10, 0),
        end_time=_utc_at(5, 18, 0),
        capacity_total=300,
        capacity_remaining=280,
        ticket_pricing={"STANDARD": 1499, "VIP": 2499},
        seat_layout=None,
    )
    occurrence_restaurant = await _get_or_create_occurrence(
        db,
        listing_id=listing_restaurant.id,
        venue_id=venue_restaurant.id,
        city_id=city_bengaluru.id,
        provider_sub_location="TABLE_BLOCK_B",
        start_time=_utc_at(1, 19, 30),
        end_time=_utc_at(1, 22, 0),
        capacity_total=50,
        capacity_remaining=44,
        ticket_pricing={"STANDARD": 1600},
        seat_layout=None,
    )
    occurrence_activity = await _get_or_create_occurrence(
        db,
        listing_id=listing_activity.id,
        venue_id=venue_activity.id,
        city_id=city_bengaluru.id,
        provider_sub_location="ZONE_ALPHA",
        start_time=_utc_at(3, 17, 0),
        end_time=_utc_at(3, 19, 0),
        capacity_total=80,
        capacity_remaining=72,
        ticket_pricing={"STANDARD": 950},
        seat_layout=None,
    )

    # Offers
    now = datetime.now(UTC)
    offer_welcome20 = await _get_or_create_offer(
        db,
        code="WELCOME20",
        title="Welcome 20% Off",
        description="20% off for first-time movie/event bookings",
        discount_type=DiscountType.PERCENT,
        discount_value=Decimal("20.00"),
        min_order_value=Decimal("500.00"),
        max_discount_value=Decimal("300.00"),
        valid_from=now - timedelta(days=7),
        valid_until=now + timedelta(days=120),
        usage_limit=5000,
        user_usage_limit=1,
        applicability={"types": ["MOVIE", "EVENT"]},
    )
    offer_flat150 = await _get_or_create_offer(
        db,
        code="FLAT150",
        title="Flat INR 150 Off",
        description="Flat INR 150 off for events above INR 1000",
        discount_type=DiscountType.FLAT,
        discount_value=Decimal("150.00"),
        min_order_value=Decimal("1000.00"),
        max_discount_value=Decimal("150.00"),
        valid_from=now - timedelta(days=3),
        valid_until=now + timedelta(days=90),
        usage_limit=2000,
        user_usage_limit=2,
        applicability={"types": ["EVENT"]},
    )

    # Bookings
    snapshot_movie = {
        "listing_id": str(listing_movie.id),
        "title": listing_movie.title,
        "type": listing_movie.type.value,
        "city_id": str(listing_movie.city_id),
        "venue_name": venue_movie.name,
        "address": venue_movie.address,
        "currency": "INR",
    }
    booking_confirmed_movie = await _get_or_create_booking(
        db,
        user_id=user_alice.id,
        occurrence_id=occurrence_movie.id,
        status=BookingStatus.CONFIRMED,
        quantity=2,
        unit_price=Decimal("270.00"),
        total_price=Decimal("637.20"),
        final_price=Decimal("509.76"),
        discount_amount=Decimal("127.44"),
        listing_snapshot=snapshot_movie,
        booked_seats=["A1", "A2"],
        ticket_breakdown={
            "tickets": {"SELECTED": 2},
            "base_amount": 540.0,
            "tax_amount": 97.2,
            "gross_amount": 637.2,
            "tax_rate": 0.18,
        },
        applied_offer_id=offer_welcome20.id,
        payment_provider="RAZORPAY",
        payment_ref="pay_seed_alice_001",
        hold_expires_at=None,
    )
    booking_hold_movie = await _get_or_create_booking(
        db,
        user_id=user_bob.id,
        occurrence_id=occurrence_movie.id,
        status=BookingStatus.HOLD,
        quantity=1,
        unit_price=Decimal("320.00"),
        total_price=Decimal("377.60"),
        final_price=Decimal("377.60"),
        discount_amount=Decimal("0.00"),
        listing_snapshot=snapshot_movie,
        booked_seats=["B1"],
        ticket_breakdown={
            "tickets": {"SELECTED": 1},
            "base_amount": 320.0,
            "tax_amount": 57.6,
            "gross_amount": 377.6,
            "tax_rate": 0.18,
        },
        applied_offer_id=None,
        payment_provider=None,
        payment_ref=None,
        hold_expires_at=now + timedelta(minutes=10),
    )

    return SeedRefs(
        admin_user=admin_user,
        user_alice=user_alice,
        user_bob=user_bob,
        city_mumbai=city_mumbai,
        city_bengaluru=city_bengaluru,
        venue_movie=venue_movie,
        venue_event=venue_event,
        venue_restaurant=venue_restaurant,
        venue_activity=venue_activity,
        listing_movie=listing_movie,
        listing_event=listing_event,
        listing_restaurant=listing_restaurant,
        listing_activity=listing_activity,
        occurrence_movie=occurrence_movie,
        occurrence_event=occurrence_event,
        occurrence_restaurant=occurrence_restaurant,
        occurrence_activity=occurrence_activity,
        offer_welcome20=offer_welcome20,
        offer_flat150=offer_flat150,
        booking_confirmed_movie=booking_confirmed_movie,
        booking_hold_movie=booking_hold_movie,
    )


async def _seed_linked_entities(db: AsyncSession, refs: SeedRefs) -> None:
    now = datetime.now(UTC)

    await _get_or_create_wishlist(
        db,
        user_id=refs.user_alice.id,
        listing_id=refs.listing_event.id,
    )
    await _get_or_create_wishlist(
        db,
        user_id=refs.user_bob.id,
        listing_id=refs.listing_activity.id,
    )

    await _get_or_create_notification(
        db,
        user_id=refs.user_alice.id,
        title="Booking Confirmed",
        body=f"Your booking for {refs.listing_movie.title} is confirmed.",
        notification_type=NotificationType.BOOKING,
        reference_id=str(refs.booking_confirmed_movie.id),
    )
    await _get_or_create_notification(
        db,
        user_id=refs.user_bob.id,
        title="Offer Available",
        body="Use WELCOME20 for 20% off on your first booking.",
        notification_type=NotificationType.OFFER,
        reference_id=str(refs.offer_welcome20.id),
    )
    await _get_or_create_notification(
        db,
        user_id=refs.user_alice.id,
        title="System Notice",
        body="Welcome to CitiConnect sample environment.",
        notification_type=NotificationType.SYSTEM,
    )

    await _get_or_create_seat_lock(
        db,
        occurrence_id=refs.occurrence_movie.id,
        user_id=refs.user_bob.id,
        seat_id="B1",
        expires_at=now + timedelta(minutes=10),
        status=SeatLockStatus.ACTIVE,
    )

    await _get_or_create_offer_usage(
        db,
        user_id=refs.user_alice.id,
        offer_id=refs.offer_welcome20.id,
        booking_id=refs.booking_confirmed_movie.id,
        used_at=now - timedelta(hours=2),
    )

    await _get_or_create_idempotency_key(
        db,
        key="seed-confirmed-booking-alice-1",
        booking_id=refs.booking_confirmed_movie.id,
    )

    await _get_or_create_audit_log(
        db,
        admin_user_id=refs.admin_user.id,
        action="SEED_DATA",
        entity_type="SYSTEM",
        entity_id="initial_dummy_seed",
        diff={
            "created_users": [refs.admin_user.email, refs.user_alice.email, refs.user_bob.email],
            "created_listings": [
                refs.listing_movie.title,
                refs.listing_event.title,
                refs.listing_restaurant.title,
                refs.listing_activity.title,
            ],
        },
    )


async def _seed_bulk_data(db: AsyncSession, refs: SeedRefs) -> None:
    import random
    from decimal import Decimal

    # Check if bulk seeding has already been run
    listing_count_stmt = select(func.count(Listing.id))
    listing_count = (await db.execute(listing_count_stmt)).scalar() or 0
    if listing_count >= 1000:
        print(f"Database already has {listing_count} listings. Skipping bulk seeding.")
        return

    print(f"Current listing count is {listing_count}. Seeding bulk data to reach 1000+ entries...")

    random.seed(42)

    # Extra Cities
    bulk_cities = [
        ("Delhi", "Delhi", "https://images.unsplash.com/photo-1587474260584-136574528ed5"),
        ("Chennai", "Tamil Nadu", "https://images.unsplash.com/photo-1582510003544-4d00b7f74220"),
        ("Hyderabad", "Telangana", "https://images.unsplash.com/photo-1605007493699-af65834f8a00"),
        ("Pune", "Maharashtra", "https://images.unsplash.com/photo-1601999109332-542b18dbec57"),
        ("Kolkata", "West Bengal", "https://images.unsplash.com/photo-1558431382-27e303142255"),
        ("Goa", "Goa", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e"),
        ("Ahmedabad", "Gujarat", "https://images.unsplash.com/photo-1603262110263-fb0112e7cc33"),
        ("Jaipur", "Rajasthan", "https://images.unsplash.com/photo-1477584305850-385010b888bb")
    ]

    cities_list = [refs.city_mumbai, refs.city_bengaluru]
    for c_name, c_state, c_img in bulk_cities:
        city = await _get_or_create_city(db, name=c_name, state=c_state, image_url=c_img)
        cities_list.append(city)

    # Venues by City
    venues_by_city = {c.id: [] for c in cities_list}
    venues_by_city[refs.city_mumbai.id].extend([refs.venue_movie, refs.venue_event])
    venues_by_city[refs.city_bengaluru.id].extend([refs.venue_restaurant, refs.venue_activity])

    venue_templates = [
        ("Inox Multiplex", VenueType.THEATER, "Mall Road"),
        ("Cinepolis Grand", VenueType.THEATER, "Commercial Center"),
        ("Royal Convention Hall", VenueType.EVENT_SPACE, "High Street"),
        ("Exhibition Arena", VenueType.EVENT_SPACE, "Industrial Zone"),
        ("The Olive Bistro", VenueType.RESTAURANT, "Lake View Road"),
        ("Gourmet Kitchen", VenueType.RESTAURANT, "Food Street"),
        ("Adventure Sports Hub", VenueType.ACTIVITY_AREA, "Ring Road"),
        ("Fun Zone Park", VenueType.ACTIVITY_AREA, "Amusement Drive")
    ]

    for city in cities_list:
        if len(venues_by_city[city.id]) < 4:
            for v_name_prefix, v_type, v_addr_suffix in venue_templates:
                v_name = f"{city.name} {v_name_prefix}"
                v_addr = f"{v_addr_suffix}, {city.name}, {city.state}"
                lat = 12.0 + random.random() * 8.0
                lon = 72.0 + random.random() * 8.0
                v = await _get_or_create_venue(
                    db,
                    city_id=city.id,
                    name=v_name,
                    venue_type=v_type,
                    address=v_addr,
                    latitude=lat,
                    longitude=lon
                )
                venues_by_city[city.id].append(v)

    # Generate listings
    types_pool = [ListingType.MOVIE, ListingType.EVENT, ListingType.RESTAURANT, ListingType.ACTIVITY]

    movie_titles = ["Interstellar", "Inception", "The Dark Knight", "Avatar", "Dune", "Matrix", "Tenet", "Joker", "Gladiator", "Titanic", "Spiderman", "Avengers", "Star Wars", "Jurassic Park", "KGF", "Pushpa", "Pathaan", "Dangal", "Bahubali", "3 Idiots"]
    movie_adjectives = ["3D", "IMAX Re-Release", "Director's Cut", "Special Edition", "4K Remaster", "Retro Screening"]

    event_titles = ["Music Concert", "Comedy Night", "Tech Summit", "Art Exhibition", "Food Festival", "Startup Pitch", "Literature Fest", "Drama Play", "Dance Workshop", "Fashion Show"]
    event_adjectives = ["Live", "Annual", "International", "Byte-sized", "Exclusive", "Midnight", "Charity", "Acoustic"]

    restaurant_titles = ["Sunset Buffet", "Barbeque Feast", "Sushi Night", "Italian Wine & Dine", "Traditional Thali", "Chefs Special Table", "Midnight Grill", "Organic Brunch"]
    restaurant_adjectives = ["Rooftop", "Premium", "Candlelight", "Royal", "Beachside", "Secret Garden"]

    activity_titles = ["Go-Karting", "Trampoline Jump", "Escape Room Challenge", "Bowling Tournament", "Paintball Arena", "Virtual Reality Quest", "Rock Climbing", "Laser Tag"]
    activity_adjectives = ["Championship", "Weekend", "Extreme", "Ultimate", "Midnight", "Family Fun"]

    categories = {
        ListingType.MOVIE: ["Sci-Fi", "Action", "Drama", "Thriller", "Romance", "Comedy"],
        ListingType.EVENT: ["Music", "Comedy", "Technology", "Art", "Food", "Business"],
        ListingType.RESTAURANT: ["Fine Dining", "Casual Dining", "Buffet", "Pub", "Cafe"],
        ListingType.ACTIVITY: ["Adventure", "Sports", "Gaming", "Kids", "Fitness"]
    }

    vibe_tags_pool = ["EXCITING", "CHILL", "TRENDING", "ROMANTIC", "FAMILY_FRIENDLY", "SOLO_FAVORITE", "PREMIUM", "BUDGET_FRIENDLY"]

    listings_created = []
    total_listings = 1020

    print("Generating 1020 listings...")
    for i in range(total_listings):
        l_type = types_pool[i % len(types_pool)]
        city = cities_list[i % len(cities_list)]

        eligible_venues = [v for v in venues_by_city[city.id] if v.venue_type.value == l_type.value or (l_type == ListingType.MOVIE and v.venue_type == VenueType.THEATER)]
        if not eligible_venues:
            eligible_venues = venues_by_city[city.id]
        venue = eligible_venues[i % len(eligible_venues)]

        if l_type == ListingType.MOVIE:
            title = f"{random.choice(movie_titles)} ({random.choice(movie_adjectives)}) #{i+1}"
            category = random.choice(categories[ListingType.MOVIE])
            cover_img = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba"
            offer_text = "20% off on first movie booking"
            meta = {"language": "English", "duration_min": random.randint(90, 180)}
        elif l_type == ListingType.EVENT:
            title = f"{random.choice(event_adjectives)} {random.choice(event_titles)} #{i+1}"
            category = random.choice(categories[ListingType.EVENT])
            cover_img = "https://images.unsplash.com/photo-1511578314322-379afb476865"
            offer_text = "Flat INR 150 off on early booking"
            meta = {"dress_code": "Casual"}
        elif l_type == ListingType.RESTAURANT:
            title = f"{random.choice(restaurant_adjectives)} {random.choice(restaurant_titles)} #{i+1}"
            category = random.choice(categories[ListingType.RESTAURANT])
            cover_img = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4"
            offer_text = "Complimentary dessert"
            meta = {"cuisine": "Multicuisine"}
        else:
            title = f"{random.choice(activity_adjectives)} {random.choice(activity_titles)} #{i+1}"
            category = random.choice(categories[ListingType.ACTIVITY])
            cover_img = "https://images.unsplash.com/photo-1511886929837-354d827aae26"
            offer_text = "Weekday special discount"
            meta = {"min_age": random.randint(5, 18)}

        price_min = Decimal(str(random.randint(150, 1000)))
        price_max = price_min + Decimal(str(random.randint(100, 1500)))
        vibes = random.sample(vibe_tags_pool, k=random.randint(2, 4))

        listing = Listing(
            type=l_type,
            title=title,
            description=f"Automated description for {title}. Experience the best of {category} at {venue.name} in {city.name}. High quality service and amazing environment guaranteed.",
            city_id=city.id,
            venue_id=venue.id,
            created_by=refs.admin_user.id,
            price_min=price_min,
            price_max=price_max,
            category=category,
            cover_image_url=cover_img,
            gallery_image_urls=[cover_img],
            offer_text=offer_text,
            vibe_tags=vibes,
            metadata_json=meta,
            is_featured=(i % 12 == 0),
            popularity_score=round(random.uniform(1.0, 5.0), 2),
            status=ListingStatus.PUBLISHED
        )
        db.add(listing)
        listings_created.append(listing)

    await db.flush()

    print("Generating occurrences...")
    occurrences_created = []
    for i, listing in enumerate(listings_created):
        start_time = _utc_at((i % 15) + 1, random.randint(10, 21), random.choice([0, 30]))
        end_time = start_time + timedelta(hours=random.randint(2, 4))

        sub_loc = f"ZONE_{random.choice(['A', 'B', 'C', 'D'])}-{random.randint(1, 10)}"
        if listing.type == ListingType.MOVIE:
            sub_loc = f"SCREEN_{random.randint(1, 5)}"
            pricing = {"PREMIUM": int(listing.price_max), "STANDARD": int(listing.price_min)}
            layout = _movie_seat_layout()
        else:
            pricing = {"STANDARD": int(listing.price_min)}
            layout = None

        occurrence = Occurrence(
            listing_id=listing.id,
            venue_id=listing.venue_id,
            city_id=listing.city_id,
            provider_sub_location=sub_loc,
            start_time=start_time,
            end_time=end_time,
            capacity_total=100,
            capacity_remaining=100,
            ticket_pricing=pricing,
            seat_layout=layout,
            status=OccurrenceStatus.SCHEDULED
        )
        db.add(occurrence)
        occurrences_created.append(occurrence)

    await db.flush()

    print("Generating 25 dummy users...")
    dummy_users = []
    for u_idx in range(25):
        u_name = f"User {u_idx+1}"
        u_email = f"user{u_idx+1}@citiconnect.dev"
        user = await _get_or_create_user(
            db,
            name=u_name,
            email=u_email,
            password="User@12345",
            role=UserRole.USER,
            phone=None
        )
        dummy_users.append(user)

    print("Generating 1050 bookings...")
    total_bookings = 1050
    for b_idx in range(total_bookings):
        user = dummy_users[b_idx % len(dummy_users)]
        occurrence = occurrences_created[b_idx % len(occurrences_created)]
        listing = listings_created[b_idx % len(listings_created)]

        qty = random.randint(1, 4)
        pricing_keys = list(occurrence.ticket_pricing.keys())
        seat_type = random.choice(pricing_keys) if pricing_keys else "STANDARD"
        price_per_unit = occurrence.ticket_pricing.get(seat_type, listing.price_min)

        base_amount = float(price_per_unit) * qty
        tax_rate = 0.18
        tax_amount = base_amount * tax_rate
        gross_amount = base_amount + tax_amount

        discount = 0.0
        applied_offer = None
        if b_idx % 7 == 0:
            applied_offer = refs.offer_welcome20
            discount = min(300.0, gross_amount * 0.20)

        final_price = gross_amount - discount

        snapshot = {
            "listing_id": str(listing.id),
            "title": listing.title,
            "type": listing.type.value,
            "city_id": str(listing.city_id),
            "venue_name": venue.name,
            "address": venue.address,
            "currency": "INR"
        }

        booked_seats_list = [f"{random.choice(['A','B','C','D'])}{random.randint(1,8)}" for _ in range(qty)] if occurrence.seat_layout else None

        booking = Booking(
            user_id=user.id,
            occurrence_id=occurrence.id,
            status=random.choice([BookingStatus.CONFIRMED, BookingStatus.CONFIRMED, BookingStatus.CONFIRMED, BookingStatus.CANCELLED]),
            quantity=qty,
            unit_price=Decimal(str(price_per_unit)),
            total_price=Decimal(str(gross_amount)),
            final_price=Decimal(str(final_price)),
            discount_amount=Decimal(str(discount)),
            listing_snapshot=snapshot,
            booked_seats=booked_seats_list,
            ticket_breakdown={
                "tickets": {seat_type: qty},
                "base_amount": base_amount,
                "tax_amount": tax_amount,
                "gross_amount": gross_amount,
                "tax_rate": tax_rate
            },
            applied_offer_id=applied_offer.id if applied_offer else None,
            payment_provider="RAZORPAY" if final_price > 0 else None,
            payment_ref=f"pay_seed_bulk_{b_idx:04d}",
            hold_expires_at=None
        )
        db.add(booking)

    print("Bulk seeding completed successfully!")


async def seed_dummy_data() -> None:
    await create_tables()
    _, session_factory = _ensure_engine()

    async with session_factory() as db:
        refs = await _seed_entities(db)
        await _seed_linked_entities(db, refs)
        await _seed_bulk_data(db, refs)
        await db.commit()

    print("Dummy seed completed successfully.")
    print("Users:")
    print("  - admin@citiconnect.dev / Admin@12345")
    print("  - alice@citiconnect.dev / Alice@12345")
    print("  - bob@citiconnect.dev / Bob@12345")


if __name__ == "__main__":
    asyncio.run(seed_dummy_data())
