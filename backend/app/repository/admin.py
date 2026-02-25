from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import String, asc, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.city import City
from app.models.enums import BookingStatus, ListingStatus, ListingType, OccurrenceStatus
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


IST_TIMEZONE_NAME = "Asia/Kolkata"


def _bucket_start_expr(column, interval: str):
    localized_time = func.timezone(IST_TIMEZONE_NAME, column)
    truncated_local = func.date_trunc(interval, localized_time)
    return func.timezone(IST_TIMEZONE_NAME, truncated_local)


def _booking_created_conditions(
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
):
    conditions = [
        Booking.status == BookingStatus.CONFIRMED,
        Booking.created_at >= start_utc,
        Booking.created_at < end_utc,
    ]
    if city_id is not None:
        conditions.append(Occurrence.city_id == city_id)
    if listing_type is not None:
        conditions.append(Listing.type == listing_type)
    return conditions


def _booking_occurrence_window_conditions(
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
):
    conditions = [
        Booking.status == BookingStatus.CONFIRMED,
        Occurrence.start_time >= start_utc,
        Occurrence.start_time < end_utc,
    ]
    if city_id is not None:
        conditions.append(Occurrence.city_id == city_id)
    if listing_type is not None:
        conditions.append(Listing.type == listing_type)
    return conditions


def _growth_pct(current: int | float, previous: int | float) -> float | None:
    if not previous:
        return None
    return ((float(current) - float(previous)) / float(previous)) * 100.0


def _source_dimension_expr(source_dimension: str):
    if source_dimension == "category":
        return func.coalesce(
            func.nullif(func.trim(Listing.category), ""),
            "Uncategorized",
        )
    if source_dimension == "listing_type":
        return cast(Listing.type, String)
    if source_dimension == "city":
        return func.coalesce(func.nullif(func.trim(City.name), ""), "Unknown")
    if source_dimension == "payment_provider":
        return func.coalesce(
            func.nullif(func.trim(Booking.payment_provider), ""),
            "Unknown",
        )
    if source_dimension == "offer_code":
        return func.coalesce(func.nullif(func.trim(Offer.code), ""), "No Offer")
    raise ValueError("Invalid source dimension")


async def fetch_dashboard_analytics_kpis(
    db: AsyncSession,
    *,
    current_start_utc: datetime,
    current_end_utc: datetime,
    previous_start_utc: datetime,
    previous_end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
) -> dict[str, object]:
    current_new_users = int(
        (
            await db.execute(
                select(func.count(User.id)).where(
                    User.created_at >= current_start_utc,
                    User.created_at < current_end_utc,
                )
            )
        ).scalar_one()
        or 0
    )
    previous_new_users = int(
        (
            await db.execute(
                select(func.count(User.id)).where(
                    User.created_at >= previous_start_utc,
                    User.created_at < previous_end_utc,
                )
            )
        ).scalar_one()
        or 0
    )

    current_revenue_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
                func.count(func.distinct(Booking.user_id)).label("transacting_users"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .where(
                *_booking_created_conditions(
                    start_utc=current_start_utc,
                    end_utc=current_end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
        )
    ).first()
    previous_revenue_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .where(
                *_booking_created_conditions(
                    start_utc=previous_start_utc,
                    end_utc=previous_end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
        )
    ).first()

    current_revenue = (
        Decimal(str(current_revenue_row[0] or 0)) if current_revenue_row else Decimal("0")
    )
    previous_revenue = (
        Decimal(str(previous_revenue_row[0] or 0))
        if previous_revenue_row
        else Decimal("0")
    )
    current_transacting_users = int(current_revenue_row[1] or 0) if current_revenue_row else 0

    attendance_total = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Booking.quantity), 0))
                .select_from(Booking)
                .join(Occurrence, Occurrence.id == Booking.occurrence_id)
                .join(Listing, Listing.id == Occurrence.listing_id)
                .where(
                    *_booking_occurrence_window_conditions(
                        start_utc=current_start_utc,
                        end_utc=current_end_utc,
                        city_id=city_id,
                        listing_type=listing_type,
                    )
                )
            )
        ).scalar_one()
        or 0
    )

    arpu = None
    if current_transacting_users > 0:
        arpu = float(current_revenue / Decimal(current_transacting_users))

    return {
        "new_users": current_new_users,
        "user_growth_rate_pct": _growth_pct(current_new_users, previous_new_users),
        "revenue_period": float(current_revenue),
        "revenue_growth_rate_pct": _growth_pct(
            float(current_revenue), float(previous_revenue)
        ),
        "arpu": arpu,
        "event_attendance_total": attendance_total,
    }


async def fetch_dashboard_analytics_series(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    interval: str,
) -> list[dict[str, object]]:
    series_by_bucket: dict[datetime, dict[str, object]] = {}

    def ensure_bucket_row(bucket_start: datetime) -> dict[str, object]:
        existing = series_by_bucket.get(bucket_start)
        if existing:
            return existing
        row = {
            "bucket_start": bucket_start,
            "bucket_label": bucket_start.isoformat(),
            "new_users": 0,
            "revenue": 0.0,
            "transacting_users": 0,
            "arpu": None,
            "attendance": 0,
        }
        series_by_bucket[bucket_start] = row
        return row

    user_bucket = _bucket_start_expr(User.created_at, interval).label("bucket_start")
    new_user_rows = (
        await db.execute(
            select(
                user_bucket,
                func.count(User.id).label("new_users"),
            )
            .where(User.created_at >= start_utc, User.created_at < end_utc)
            .group_by(user_bucket)
            .order_by(user_bucket.asc())
        )
    ).all()
    for bucket_start, new_users in new_user_rows:
        if bucket_start is None:
            continue
        row = ensure_bucket_row(bucket_start)
        row["new_users"] = int(new_users or 0)

    revenue_bucket = _bucket_start_expr(Booking.created_at, interval).label("bucket_start")
    revenue_rows = (
        await db.execute(
            select(
                revenue_bucket,
                func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
                func.count(func.distinct(Booking.user_id)).label("transacting_users"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .where(
                *_booking_created_conditions(
                    start_utc=start_utc,
                    end_utc=end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
            .group_by(revenue_bucket)
            .order_by(revenue_bucket.asc())
        )
    ).all()
    for bucket_start, revenue, transacting_users in revenue_rows:
        if bucket_start is None:
            continue
        row = ensure_bucket_row(bucket_start)
        row["revenue"] = float(revenue or 0)
        row["transacting_users"] = int(transacting_users or 0)

    attendance_bucket = _bucket_start_expr(Occurrence.start_time, interval).label(
        "bucket_start"
    )
    attendance_rows = (
        await db.execute(
            select(
                attendance_bucket,
                func.coalesce(func.sum(Booking.quantity), 0).label("attendance"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .where(
                *_booking_occurrence_window_conditions(
                    start_utc=start_utc,
                    end_utc=end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
            .group_by(attendance_bucket)
            .order_by(attendance_bucket.asc())
        )
    ).all()
    for bucket_start, attendance in attendance_rows:
        if bucket_start is None:
            continue
        row = ensure_bucket_row(bucket_start)
        row["attendance"] = int(attendance or 0)

    rows = sorted(
        series_by_bucket.values(),
        key=lambda item: item["bucket_start"],
    )
    for row in rows:
        transacting_users = int(row.get("transacting_users") or 0)
        revenue = float(row.get("revenue") or 0)
        row["arpu"] = revenue / transacting_users if transacting_users > 0 else None
    return rows


async def fetch_dashboard_revenue_sources(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    source_dimension: str,
    limit: int,
) -> list[dict[str, object]]:
    source_expr = _source_dimension_expr(source_dimension).label("key")
    stmt = (
        select(
            source_expr,
            func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            func.count(Booking.id).label("bookings"),
            func.count(func.distinct(Booking.user_id)).label("transacting_users"),
        )
        .select_from(Booking)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id)
        .join(Listing, Listing.id == Occurrence.listing_id)
        .join(City, City.id == Occurrence.city_id, isouter=True)
    )
    if source_dimension == "offer_code":
        stmt = stmt.join(Offer, Offer.id == Booking.applied_offer_id, isouter=True)
    stmt = stmt.where(
        *_booking_created_conditions(
            start_utc=start_utc,
            end_utc=end_utc,
            city_id=city_id,
            listing_type=listing_type,
        )
    )
    stmt = (
        stmt.group_by(source_expr)
        .order_by(desc(func.coalesce(func.sum(Booking.final_price), 0)), asc(source_expr))
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "key": str(row[0] or "Unknown"),
            "revenue": float(row[1] or 0),
            "bookings": int(row[2] or 0),
            "transacting_users": int(row[3] or 0),
        }
        for row in rows
    ]


async def fetch_dashboard_usage_by_region(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    limit: int,
) -> list[dict[str, object]]:
    city_name = func.coalesce(func.nullif(func.trim(City.name), ""), "Unknown").label(
        "city_name"
    )
    rows = (
        await db.execute(
            select(
                Occurrence.city_id,
                city_name,
                func.count(Booking.id).label("bookings"),
                func.count(func.distinct(Booking.user_id)).label("transacting_users"),
                func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .join(City, City.id == Occurrence.city_id, isouter=True)
            .where(
                *_booking_created_conditions(
                    start_utc=start_utc,
                    end_utc=end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
            .group_by(Occurrence.city_id, city_name)
            .order_by(
                desc(func.coalesce(func.sum(Booking.final_price), 0)),
                asc(city_name),
            )
            .limit(limit)
        )
    ).all()
    return [
        {
            "city_id": row[0],
            "city_name": str(row[1] or "Unknown"),
            "bookings": int(row[2] or 0),
            "transacting_users": int(row[3] or 0),
            "revenue": float(row[4] or 0),
        }
        for row in rows
    ]


async def fetch_dashboard_event_attendance(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    limit: int,
) -> list[dict[str, object]]:
    city_name = func.coalesce(func.nullif(func.trim(City.name), ""), "Unknown").label(
        "city_name"
    )
    rows = (
        await db.execute(
            select(
                Occurrence.id.label("occurrence_id"),
                Listing.id.label("listing_id"),
                Listing.title.label("listing_title"),
                city_name,
                Occurrence.start_time.label("occurrence_start"),
                func.coalesce(func.sum(Booking.quantity), 0).label("attendance"),
                func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
                func.count(Booking.id).label("confirmed_bookings"),
            )
            .select_from(Booking)
            .join(Occurrence, Occurrence.id == Booking.occurrence_id)
            .join(Listing, Listing.id == Occurrence.listing_id)
            .join(City, City.id == Occurrence.city_id, isouter=True)
            .where(
                *_booking_occurrence_window_conditions(
                    start_utc=start_utc,
                    end_utc=end_utc,
                    city_id=city_id,
                    listing_type=listing_type,
                )
            )
            .group_by(
                Occurrence.id,
                Listing.id,
                Listing.title,
                city_name,
                Occurrence.start_time,
            )
            .order_by(
                desc(func.coalesce(func.sum(Booking.quantity), 0)),
                desc(func.coalesce(func.sum(Booking.final_price), 0)),
                asc(Listing.title),
            )
            .limit(limit)
        )
    ).all()
    return [
        {
            "occurrence_id": row[0],
            "listing_id": row[1],
            "listing_title": str(row[2] or "Listing"),
            "city_name": str(row[3] or "Unknown"),
            "occurrence_start": row[4],
            "attendance": int(row[5] or 0),
            "revenue": float(row[6] or 0),
            "confirmed_bookings": int(row[7] or 0),
        }
        for row in rows
    ]


async def fetch_dashboard_drill_revenue_sources(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    source_dimension: str,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[dict[str, object]], int]:
    source_expr = _source_dimension_expr(source_dimension).label("key")
    grouped_stmt = (
        select(
            source_expr,
            func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            func.count(Booking.id).label("bookings"),
            func.count(func.distinct(Booking.user_id)).label("transacting_users"),
        )
        .select_from(Booking)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id)
        .join(Listing, Listing.id == Occurrence.listing_id)
        .join(City, City.id == Occurrence.city_id, isouter=True)
    )
    if source_dimension == "offer_code":
        grouped_stmt = grouped_stmt.join(
            Offer, Offer.id == Booking.applied_offer_id, isouter=True
        )
    grouped_stmt = grouped_stmt.where(
        *_booking_created_conditions(
            start_utc=start_utc,
            end_utc=end_utc,
            city_id=city_id,
            listing_type=listing_type,
        )
    ).group_by(source_expr)

    grouped_subquery = grouped_stmt.subquery()
    sort_map = {
        "key": grouped_subquery.c.key,
        "revenue": grouped_subquery.c.revenue,
        "bookings": grouped_subquery.c.bookings,
        "transacting_users": grouped_subquery.c.transacting_users,
    }
    sort_column = sort_map[sort_by]
    order_expr = asc(sort_column) if sort_dir == "asc" else desc(sort_column)

    total = int(
        (
            await db.execute(select(func.count()).select_from(grouped_subquery))
        ).scalar_one()
        or 0
    )
    rows = (
        await db.execute(
            select(
                grouped_subquery.c.key,
                grouped_subquery.c.revenue,
                grouped_subquery.c.bookings,
                grouped_subquery.c.transacting_users,
            )
            .select_from(grouped_subquery)
            .order_by(order_expr, asc(grouped_subquery.c.key))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        {
            "key": str(row[0] or "Unknown"),
            "revenue": float(row[1] or 0),
            "bookings": int(row[2] or 0),
            "transacting_users": int(row[3] or 0),
        }
        for row in rows
    ]
    return items, total


async def fetch_dashboard_drill_usage_by_region(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[dict[str, object]], int]:
    city_name = func.coalesce(func.nullif(func.trim(City.name), ""), "Unknown").label(
        "city_name"
    )
    grouped_subquery = (
        select(
            Occurrence.city_id.label("city_id"),
            city_name,
            func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            func.count(Booking.id).label("bookings"),
            func.count(func.distinct(Booking.user_id)).label("transacting_users"),
        )
        .select_from(Booking)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id)
        .join(Listing, Listing.id == Occurrence.listing_id)
        .join(City, City.id == Occurrence.city_id, isouter=True)
        .where(
            *_booking_created_conditions(
                start_utc=start_utc,
                end_utc=end_utc,
                city_id=city_id,
                listing_type=listing_type,
            )
        )
        .group_by(Occurrence.city_id, city_name)
        .subquery()
    )

    sort_map = {
        "city_name": grouped_subquery.c.city_name,
        "revenue": grouped_subquery.c.revenue,
        "bookings": grouped_subquery.c.bookings,
        "transacting_users": grouped_subquery.c.transacting_users,
    }
    sort_column = sort_map[sort_by]
    order_expr = asc(sort_column) if sort_dir == "asc" else desc(sort_column)
    total = int(
        (
            await db.execute(select(func.count()).select_from(grouped_subquery))
        ).scalar_one()
        or 0
    )
    rows = (
        await db.execute(
            select(
                grouped_subquery.c.city_id,
                grouped_subquery.c.city_name,
                grouped_subquery.c.revenue,
                grouped_subquery.c.bookings,
                grouped_subquery.c.transacting_users,
            )
            .order_by(order_expr, asc(grouped_subquery.c.city_name))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        {
            "city_id": row[0],
            "city_name": str(row[1] or "Unknown"),
            "revenue": float(row[2] or 0),
            "bookings": int(row[3] or 0),
            "transacting_users": int(row[4] or 0),
        }
        for row in rows
    ]
    return items, total


async def fetch_dashboard_drill_event_attendance(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    city_id: UUID | None,
    listing_type: ListingType | None,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[dict[str, object]], int]:
    city_name = func.coalesce(func.nullif(func.trim(City.name), ""), "Unknown").label(
        "city_name"
    )
    grouped_subquery = (
        select(
            Occurrence.id.label("occurrence_id"),
            Listing.id.label("listing_id"),
            Listing.title.label("listing_title"),
            city_name,
            Occurrence.start_time.label("occurrence_start"),
            func.coalesce(func.sum(Booking.quantity), 0).label("attendance"),
            func.coalesce(func.sum(Booking.final_price), 0).label("revenue"),
            func.count(Booking.id).label("confirmed_bookings"),
        )
        .select_from(Booking)
        .join(Occurrence, Occurrence.id == Booking.occurrence_id)
        .join(Listing, Listing.id == Occurrence.listing_id)
        .join(City, City.id == Occurrence.city_id, isouter=True)
        .where(
            *_booking_occurrence_window_conditions(
                start_utc=start_utc,
                end_utc=end_utc,
                city_id=city_id,
                listing_type=listing_type,
            )
        )
        .group_by(
            Occurrence.id,
            Listing.id,
            Listing.title,
            city_name,
            Occurrence.start_time,
        )
        .subquery()
    )

    sort_map = {
        "listing_title": grouped_subquery.c.listing_title,
        "city_name": grouped_subquery.c.city_name,
        "occurrence_start": grouped_subquery.c.occurrence_start,
        "attendance": grouped_subquery.c.attendance,
        "revenue": grouped_subquery.c.revenue,
        "confirmed_bookings": grouped_subquery.c.confirmed_bookings,
    }
    sort_column = sort_map[sort_by]
    order_expr = asc(sort_column) if sort_dir == "asc" else desc(sort_column)
    total = int(
        (
            await db.execute(select(func.count()).select_from(grouped_subquery))
        ).scalar_one()
        or 0
    )
    rows = (
        await db.execute(
            select(
                grouped_subquery.c.occurrence_id,
                grouped_subquery.c.listing_id,
                grouped_subquery.c.listing_title,
                grouped_subquery.c.city_name,
                grouped_subquery.c.occurrence_start,
                grouped_subquery.c.attendance,
                grouped_subquery.c.revenue,
                grouped_subquery.c.confirmed_bookings,
            )
            .order_by(order_expr, desc(grouped_subquery.c.occurrence_start))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        {
            "occurrence_id": row[0],
            "listing_id": row[1],
            "listing_title": str(row[2] or "Listing"),
            "city_name": str(row[3] or "Unknown"),
            "occurrence_start": row[4],
            "attendance": int(row[5] or 0),
            "revenue": float(row[6] or 0),
            "confirmed_bookings": int(row[7] or 0),
        }
        for row in rows
    ]
    return items, total


async def fetch_dashboard_drill_new_users(
    db: AsyncSession,
    *,
    start_utc: datetime,
    end_utc: datetime,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[dict[str, object]], int]:
    sort_map = {
        "id": User.id,
        "name": User.name,
        "email": User.email,
        "created_at": User.created_at,
    }
    sort_column = sort_map[sort_by]
    order_expr = asc(sort_column) if sort_dir == "asc" else desc(sort_column)
    conditions = [User.created_at >= start_utc, User.created_at < end_utc]

    total = int(
        (
            await db.execute(select(func.count(User.id)).where(*conditions))
        ).scalar_one()
        or 0
    )
    rows = (
        await db.execute(
            select(
                User.id,
                User.name,
                User.email,
                User.created_at,
            )
            .where(*conditions)
            .order_by(order_expr, desc(User.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        {
            "id": row[0],
            "name": row[1] or "",
            "email": row[2] or "",
            "created_at": row[3],
        }
        for row in rows
    ]
    return items, total


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
