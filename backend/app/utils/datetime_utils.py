from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def to_start_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.min)


def to_end_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.max)


def reference_end_time(
    start_time: datetime | None, end_time: datetime | None
) -> datetime | None:
    return normalize_datetime(end_time) or normalize_datetime(start_time)


def utcnow() -> datetime:
    # Standardize server-side timestamps as UTC-aware to match timestamptz columns.
    return datetime.now(timezone.utc)


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


IST_TIMEZONE_NAME = "Asia/Kolkata"
IST_TIMEZONE = ZoneInfo(IST_TIMEZONE_NAME)


def utc_to_ist(value: datetime) -> datetime:
    normalized = normalize_datetime(value)
    if normalized is None:
        return datetime.now(IST_TIMEZONE)
    return normalized.astimezone(IST_TIMEZONE)


def ist_start_end_utc_for_date(value: date) -> tuple[datetime, datetime]:
    start_ist = datetime.combine(value, time.min, tzinfo=IST_TIMEZONE)
    end_ist = start_ist + timedelta(days=1)
    return start_ist.astimezone(timezone.utc), end_ist.astimezone(timezone.utc)


def resolve_ist_range_for_preset(
    *,
    preset: str,
    date_from: date | None,
    date_to: date | None,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    reference_utc = normalize_datetime(now) or utcnow()
    reference_ist = reference_utc.astimezone(IST_TIMEZONE)
    normalized_preset = str(preset or "30d").strip().lower()

    if normalized_preset == "custom":
        if not date_from or not date_to:
            raise ValueError("date_from and date_to are required for custom preset")
        if date_to < date_from:
            raise ValueError("date_to must be greater than or equal to date_from")
        start_utc, _ = ist_start_end_utc_for_date(date_from)
        _, end_utc = ist_start_end_utc_for_date(date_to)
        return start_utc, end_utc

    if normalized_preset == "mtd":
        month_start = date(reference_ist.year, reference_ist.month, 1)
        start_utc, _ = ist_start_end_utc_for_date(month_start)
        return start_utc, reference_utc

    day_map = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
    }
    days = day_map.get(normalized_preset)
    if days is None:
        raise ValueError("Invalid preset")

    start_date = reference_ist.date() - timedelta(days=days - 1)
    start_utc, _ = ist_start_end_utc_for_date(start_date)
    return start_utc, reference_utc

