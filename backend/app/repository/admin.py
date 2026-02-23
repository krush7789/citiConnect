from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.city import City
from app.models.enums import BookingStatus, ListingStatus, OccurrenceStatus
from app.models.listing import Listing
from app.models.occurrence import Occurrence
from app.models.offer import Offer
from app.models.user import User
from app.models.venue import Venue


async def fetch_dashboard_payload(
    db: AsyncSession,
    *,
    start_of_day: datetime,
    next_day: datetime,
    week_ago: datetime,
) -> dict[str, object]:
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
        "total_listings": total_listings,
        "active_listings": active_listings,
        "total_bookings": total_bookings,
        "bookings_today": bookings_today,
        "bookings_this_week": bookings_this_week,
        "active_users": active_users,
        "total_revenue": total_revenue,
        "recent_rows": recent_rows,
        "top_rows": top_rows,
        "category_rows": category_rows,
    }


async def list_admin_listings(
    db: AsyncSession,
    *,
    type_enum,
    status_enum,
    query_text: str | None,
    listing_uuid: UUID | None,
    city_uuid: UUID | None,
    city_query_text: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Listing, str | None, int]], int]:
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
    if query_text:
        query = f"%{query_text}%"
        search_predicates = [
            Listing.title.ilike(query),
            Listing.category.ilike(query),
        ]
        if listing_uuid:
            search_predicates.append(Listing.id == listing_uuid)
        stmt = stmt.where(or_(*search_predicates))
        count_stmt = count_stmt.where(or_(*search_predicates))
    if city_uuid:
        stmt = stmt.where(Listing.city_id == city_uuid)
        count_stmt = count_stmt.where(Listing.city_id == city_uuid)
    elif city_query_text:
        city_query = f"%{city_query_text}%"
        stmt = stmt.where(City.name.ilike(city_query))
        count_stmt = count_stmt.where(City.name.ilike(city_query))

    stmt = (
        stmt.order_by(Listing.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()
    normalized_rows = [(row[0], row[1], int(row[2] or 0)) for row in rows]
    return normalized_rows, total


async def get_listing_with_location(
    db: AsyncSession, listing_id: UUID
) -> tuple[Listing, str | None, str | None, str | None] | None:
    row = (
        await db.execute(
            select(Listing, City.name, Venue.name, Venue.address)
            .join(City, City.id == Listing.city_id)
            .join(Venue, Venue.id == Listing.venue_id)
            .where(Listing.id == listing_id)
            .limit(1)
        )
    ).first()
    return row


async def get_listing(db: AsyncSession, listing_id: UUID) -> Listing | None:
    return await db.get(Listing, listing_id)


async def get_city(db: AsyncSession, city_id: UUID) -> City | None:
    return await db.get(City, city_id)


async def get_venue(db: AsyncSession, venue_id: UUID) -> Venue | None:
    return await db.get(Venue, venue_id)


async def get_occurrence(db: AsyncSession, occurrence_id: UUID) -> Occurrence | None:
    return await db.get(Occurrence, occurrence_id)


async def get_offer(db: AsyncSession, offer_id: UUID) -> Offer | None:
    return await db.get(Offer, offer_id)


async def find_city_by_name_case_insensitive(
    db: AsyncSession, name: str
) -> City | None:
    return (
        await db.execute(
            select(City).where(func.lower(City.name) == name.strip().lower()).limit(1)
        )
    ).scalar_one_or_none()


async def find_venue_by_city_and_name_case_insensitive(
    db: AsyncSession,
    *,
    city_id: UUID,
    venue_name: str,
) -> Venue | None:
    return (
        await db.execute(
            select(Venue)
            .where(
                Venue.city_id == city_id,
                func.lower(Venue.name) == venue_name.strip().lower(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def find_offer_id_by_code_case_insensitive(
    db: AsyncSession,
    *,
    code: str,
    exclude_offer_id: UUID | None = None,
) -> UUID | None:
    stmt = select(Offer.id).where(func.lower(Offer.code) == code.lower()).limit(1)
    if exclude_offer_id is not None:
        stmt = stmt.where(Offer.id != exclude_offer_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_scheduled_occurrences_for_listing(
    db: AsyncSession, listing_id: UUID
) -> list[Occurrence]:
    return (
        (
            await db.execute(
                select(Occurrence).where(
                    Occurrence.listing_id == listing_id,
                    Occurrence.status == OccurrenceStatus.SCHEDULED,
                )
            )
        )
        .scalars()
        .all()
    )


async def list_admin_occurrences(
    db: AsyncSession,
    *,
    listing_id: UUID,
    status_enum,
    query_text: str | None,
    occurrence_uuid: UUID | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Occurrence, str | None]], int]:
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
    if query_text:
        query = f"%{query_text}%"
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
    return rows, total


async def list_occurrence_bookings_with_user(
    db: AsyncSession, occurrence_id: UUID
) -> list[tuple[Booking, str | None, str | None]]:
    return (
        (
            await db.execute(
                select(Booking, User.name, User.email)
                .join(User, User.id == Booking.user_id)
                .where(
                    Booking.occurrence_id == occurrence_id,
                    Booking.status.in_([BookingStatus.HOLD, BookingStatus.CONFIRMED]),
                )
            )
        )
        .all()
    )


async def list_admin_bookings(
    db: AsyncSession,
    *,
    status_enum,
    from_dt: datetime | None,
    to_dt: datetime | None,
    listing_query_text: str | None,
    user_query_text: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple], int]:
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
    if from_dt:
        stmt = stmt.where(Booking.created_at >= from_dt)
        count_stmt = count_stmt.where(Booking.created_at >= from_dt)
    if to_dt:
        stmt = stmt.where(Booking.created_at <= to_dt)
        count_stmt = count_stmt.where(Booking.created_at <= to_dt)
    if listing_query_text:
        query = f"%{listing_query_text}%"
        stmt = stmt.where(Listing.title.ilike(query))
        count_stmt = count_stmt.where(Listing.title.ilike(query))
    if user_query_text:
        query = f"%{user_query_text}%"
        predicate = or_(User.name.ilike(query), User.email.ilike(query))
        stmt = stmt.where(predicate)
        count_stmt = count_stmt.where(predicate)

    stmt = (
        stmt.order_by(Booking.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()
    return rows, total


async def list_admin_offers(
    db: AsyncSession,
    *,
    is_active: bool | None,
    code_query_text: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Offer], int]:
    stmt = select(Offer)
    count_stmt = select(func.count(Offer.id))

    if is_active is not None:
        stmt = stmt.where(Offer.is_active == is_active)
        count_stmt = count_stmt.where(Offer.is_active == is_active)
    if code_query_text:
        query = f"%{code_query_text}%"
        stmt = stmt.where(Offer.code.ilike(query))
        count_stmt = count_stmt.where(Offer.code.ilike(query))

    stmt = stmt.order_by(Offer.valid_until.desc().nulls_last(), Offer.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).scalars().all()
    return rows, total


async def list_admin_audit_logs(
    db: AsyncSession,
    *,
    action: str | None,
    entity_type: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[AdminAuditLog, str | None]], int]:
    stmt = select(AdminAuditLog, User.name).join(
        User, User.id == AdminAuditLog.admin_user_id, isouter=True
    )
    count_stmt = select(func.count(AdminAuditLog.id))

    if action:
        normalized_action = action.strip().upper()
        stmt = stmt.where(AdminAuditLog.action == normalized_action)
        count_stmt = count_stmt.where(AdminAuditLog.action == normalized_action)
    if entity_type:
        normalized_entity_type = entity_type.strip().upper()
        stmt = stmt.where(AdminAuditLog.entity_type == normalized_entity_type)
        count_stmt = count_stmt.where(
            AdminAuditLog.entity_type == normalized_entity_type
        )

    stmt = (
        stmt.order_by(AdminAuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt)).all()
    return rows, total


def add_instance(db: AsyncSession, instance) -> None:
    db.add(instance)


def add_instances(db: AsyncSession, instances: list) -> None:
    db.add_all(instances)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def commit(db: AsyncSession) -> None:
    await db.commit()


async def refresh(db: AsyncSession, instance) -> None:
    await db.refresh(instance)
