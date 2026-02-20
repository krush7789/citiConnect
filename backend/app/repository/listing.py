from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, and_, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.city import City
from app.models.enums import BookingStatus, ListingStatus, ListingType, OccurrenceStatus, SeatLockStatus
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.seat_lock import SeatLock
from app.models.venue import Venue
from app.models.wishlist import Wishlist
from app.services.geo import haversine_sql_expression

NATIONWIDE_CITY_ALIASES = ("all india", "nationwide", "pan india", "pan-india")


async def _get_nationwide_city_ids(db: AsyncSession) -> list[UUID]:
    rows = (
        await db.execute(
            select(City.id).where(func.lower(City.name).in_(NATIONWIDE_CITY_ALIASES))
        )
    ).scalars().all()
    return list(rows)


def _apply_city_scope_filter(
    stmt,
    *,
    city_id: UUID,
    nationwide_city_ids: list[UUID] | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    if not nationwide_city_ids:
        return stmt.where(Listing.city_id == city_id)

    city_occurrence_exists = select(Occurrence.id).where(
        Occurrence.listing_id == Listing.id,
        Occurrence.city_id == city_id,
        Occurrence.status == OccurrenceStatus.SCHEDULED,
    )
    if date_from:
        city_occurrence_exists = city_occurrence_exists.where(Occurrence.start_time >= date_from)
    if date_to:
        city_occurrence_exists = city_occurrence_exists.where(Occurrence.start_time <= date_to)

    return stmt.where(
        or_(
            Listing.city_id == city_id,
            and_(
                Listing.city_id.in_(nationwide_city_ids),
                exists(city_occurrence_exists),
            ),
        )
    )


def _apply_common_listing_filters(
    stmt,
    *,
    types: list[ListingType] | None,
    city_id: UUID | None,
    nationwide_city_ids: list[UUID] | None,
    category: str | None,
    q: str | None,
    is_featured: bool | None,
    date_from: datetime | None,
    date_to: datetime | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
):
    stmt = stmt.where(Listing.status == ListingStatus.PUBLISHED)

    if types:
        stmt = stmt.where(Listing.type.in_(types))
    if city_id:
        stmt = _apply_city_scope_filter(
            stmt,
            city_id=city_id,
            nationwide_city_ids=nationwide_city_ids,
            date_from=date_from,
            date_to=date_to,
        )
    if category:
        stmt = stmt.where(Listing.category == category)
    if q:
        q_like = f"%{q.strip()}%"
        stmt = stmt.where(Listing.title.ilike(q_like))
    if is_featured is not None:
        stmt = stmt.where(Listing.is_featured == is_featured)
    if price_min is not None:
        stmt = stmt.where(Listing.price_min >= price_min)
    if price_max is not None:
        stmt = stmt.where(Listing.price_max <= price_max)

    if date_from or date_to:
        occ_exists = select(Occurrence.id).where(
            Occurrence.listing_id == Listing.id,
            Occurrence.status == OccurrenceStatus.SCHEDULED,
        )
        if date_from:
            occ_exists = occ_exists.where(Occurrence.start_time >= date_from)
        if date_to:
            occ_exists = occ_exists.where(Occurrence.start_time <= date_to)
        stmt = stmt.where(exists(occ_exists))

    return stmt


async def list_listings(
    db: AsyncSession,
    *,
    types: list[ListingType] | None,
    city_id: UUID | None,
    category: str | None,
    q: str | None,
    is_featured: bool | None,
    date_from: datetime | None,
    date_to: datetime | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
    sort: str,
    page: int,
    page_size: int,
    user_id: UUID | None,
    user_lat: float | None,
    user_lon: float | None,
    radius_km: float | None,
):
    nationwide_city_ids = await _get_nationwide_city_ids(db) if city_id else []

    now = datetime.now(UTC)
    next_occurrence_subq = (
        select(
            Occurrence.listing_id.label("listing_id"),
            func.min(Occurrence.start_time).label("next_start_time"),
        )
        .where(
            Occurrence.status == OccurrenceStatus.SCHEDULED,
            or_(
                Occurrence.end_time >= now,
                (Occurrence.end_time.is_(None) & (Occurrence.start_time >= now)),
            ),
        )
        .group_by(Occurrence.listing_id)
        .subquery()
    )

    is_wishlisted_expr = literal(False)
    if user_id:
        is_wishlisted_expr = exists(
            select(Wishlist.id).where(Wishlist.listing_id == Listing.id, Wishlist.user_id == user_id)
        )

    distance_expr = None
    if user_lat is not None and user_lon is not None:
        distance_expr = haversine_sql_expression(Venue.latitude, Venue.longitude, user_lat, user_lon).label("distance_km")

    columns = [
        Listing,
        City,
        Venue,
        is_wishlisted_expr.label("is_wishlisted"),
        next_occurrence_subq.c.next_start_time,
    ]
    if distance_expr is not None:
        columns.append(distance_expr)

    stmt: Select = (
        select(*columns)
        .join(City, City.id == Listing.city_id)
        .join(Venue, Venue.id == Listing.venue_id)
        .outerjoin(next_occurrence_subq, next_occurrence_subq.c.listing_id == Listing.id)
    )

    count_stmt = select(func.count(Listing.id))

    stmt = _apply_common_listing_filters(
        stmt,
        types=types,
        city_id=city_id,
        nationwide_city_ids=nationwide_city_ids,
        category=category,
        q=q,
        is_featured=is_featured,
        date_from=date_from,
        date_to=date_to,
        price_min=price_min,
        price_max=price_max,
    )
    count_stmt = _apply_common_listing_filters(
        count_stmt,
        types=types,
        city_id=city_id,
        nationwide_city_ids=nationwide_city_ids,
        category=category,
        q=q,
        is_featured=is_featured,
        date_from=date_from,
        date_to=date_to,
        price_min=price_min,
        price_max=price_max,
    )

    if distance_expr is not None:
        count_stmt = count_stmt.join(Venue, Venue.id == Listing.venue_id)
        stmt = stmt.where(Venue.latitude.is_not(None), Venue.longitude.is_not(None))
        count_stmt = count_stmt.where(Venue.latitude.is_not(None), Venue.longitude.is_not(None))
        if radius_km is not None:
            stmt = stmt.where(distance_expr <= radius_km)
            count_stmt = count_stmt.where(
                haversine_sql_expression(Venue.latitude, Venue.longitude, user_lat, user_lon) <= radius_km
            )

    if sort == "newest":
        stmt = stmt.order_by(Listing.created_at.desc())
    elif sort == "price_asc":
        stmt = stmt.order_by(Listing.price_min.asc().nulls_last(), Listing.created_at.desc())
    elif sort == "price_desc":
        stmt = stmt.order_by(Listing.price_min.desc().nulls_last(), Listing.created_at.desc())
    elif sort == "date":
        stmt = stmt.order_by(next_occurrence_subq.c.next_start_time.asc().nulls_last(), Listing.created_at.desc())
    elif sort == "popularity":
        stmt = stmt.order_by(Listing.popularity_score.desc(), Listing.created_at.desc())
    elif sort == "distance" and distance_expr is not None:
        stmt = stmt.order_by(distance_expr.asc().nulls_last(), Listing.created_at.desc())
    else:
        stmt = stmt.order_by(Listing.created_at.desc())

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()
    return rows, total


async def get_next_occurrences_for_listing_ids(
    db: AsyncSession, listing_ids: list[UUID]
) -> dict[UUID, Occurrence]:
    if not listing_ids:
        return {}

    now = datetime.now(UTC)

    stmt = (
        select(Occurrence)
        .where(
            Occurrence.listing_id.in_(listing_ids),
            Occurrence.status == OccurrenceStatus.SCHEDULED,
            or_(
                Occurrence.end_time >= now,
                (Occurrence.end_time.is_(None) & (Occurrence.start_time >= now)),
            ),
        )
        .order_by(Occurrence.listing_id.asc(), Occurrence.start_time.asc())
    )

    rows = (await db.execute(stmt)).scalars().all()
    result: dict[UUID, Occurrence] = {}
    for row in rows:
        if row.listing_id not in result:
            result[row.listing_id] = row
    return result


async def get_listing_by_id(db: AsyncSession, listing_id: UUID):
    stmt = (
        select(Listing, City, Venue)
        .join(City, City.id == Listing.city_id)
        .join(Venue, Venue.id == Listing.venue_id)
        .where(Listing.id == listing_id, Listing.status == ListingStatus.PUBLISHED)
    )
    return (await db.execute(stmt)).first()


async def list_occurrences_for_listing(
    db: AsyncSession,
    *,
    listing_id: UUID,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[Occurrence]:
    stmt = select(Occurrence).where(
        Occurrence.listing_id == listing_id,
        Occurrence.status != OccurrenceStatus.ARCHIVED,
    )
    if date_from:
        stmt = stmt.where(Occurrence.start_time >= date_from)
    if date_to:
        stmt = stmt.where(Occurrence.start_time <= date_to)

    stmt = stmt.order_by(Occurrence.start_time.asc())
    return (await db.execute(stmt)).scalars().all()


async def get_occurrence_by_id(db: AsyncSession, occurrence_id: UUID) -> Occurrence | None:
    return await db.get(Occurrence, occurrence_id)


async def get_confirmed_booked_seats(db: AsyncSession, occurrence_id: UUID) -> set[str]:
    stmt = select(Booking.booked_seats).where(
        Booking.occurrence_id == occurrence_id,
        Booking.status == BookingStatus.CONFIRMED,
        Booking.booked_seats.is_not(None),
    )
    rows = (await db.execute(stmt)).scalars().all()

    seats: set[str] = set()
    for row in rows:
        if isinstance(row, list):
            seats.update([str(seat_id) for seat_id in row])
    return seats


async def get_active_seat_locks(
    db: AsyncSession,
    occurrence_id: UUID,
    now: datetime | None = None,
) -> dict[str, SeatLock]:
    reference = now or datetime.now(UTC)
    stmt = select(SeatLock).where(
        SeatLock.occurrence_id == occurrence_id,
        SeatLock.status == SeatLockStatus.ACTIVE,
        SeatLock.expires_at > reference,
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {row.seat_id: row for row in rows}


async def get_filters_metadata(
    db: AsyncSession,
    *,
    city_id: UUID | None,
    types: list[ListingType] | None,
) -> dict:
    stmt = select(Listing.category, Listing.vibe_tags, Listing.price_min, Listing.price_max).where(
        Listing.status == ListingStatus.PUBLISHED
    )

    if city_id:
        nationwide_city_ids = await _get_nationwide_city_ids(db)
        stmt = _apply_city_scope_filter(
            stmt,
            city_id=city_id,
            nationwide_city_ids=nationwide_city_ids,
            date_from=None,
            date_to=None,
        )
    if types:
        stmt = stmt.where(Listing.type.in_(types))

    rows = (await db.execute(stmt)).all()

    categories = sorted({row[0] for row in rows if row[0]})
    vibe_set: set[str] = set()
    min_price: Decimal | None = None
    max_price: Decimal | None = None

    for _, vibe_tags, p_min, p_max in rows:
        if isinstance(vibe_tags, list):
            for tag in vibe_tags:
                if isinstance(tag, str):
                    vibe_set.add(tag)

        if p_min is not None:
            min_price = p_min if min_price is None else min(min_price, p_min)
        if p_max is not None:
            max_price = p_max if max_price is None else max(max_price, p_max)

    return {
        "categories": categories,
        "vibe_tags": sorted(vibe_set),
        "price_range": {
            "min": float(min_price or 0),
            "max": float(max_price or 0),
        },
    }
