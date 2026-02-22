from datetime import UTC, date, datetime, time

def to_start_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.min, tzinfo=UTC)

def to_end_of_day(value: date | None) -> datetime | None:
    if not value:
        return None
    return datetime.combine(value, time.max, tzinfo=UTC)

def reference_end_time(start_time: datetime | None, end_time: datetime | None) -> datetime | None:
    return end_time or start_time
