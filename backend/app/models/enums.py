from enum import StrEnum


class UserRole(StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"


class VenueType(StrEnum):
    THEATER = "THEATER"
    RESTAURANT = "RESTAURANT"
    EVENT_SPACE = "EVENT_SPACE"
    ACTIVITY_AREA = "ACTIVITY_AREA"


class ListingType(StrEnum):
    EVENT = "EVENT"
    MOVIE = "MOVIE"
    RESTAURANT = "RESTAURANT"
    ACTIVITY = "ACTIVITY"


class ListingStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class OccurrenceStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    CANCELLED = "CANCELLED"
    SOLD_OUT = "SOLD_OUT"
    ARCHIVED = "ARCHIVED"


class BookingStatus(StrEnum):
    HOLD = "HOLD"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"


class DiscountType(StrEnum):
    PERCENT = "PERCENT"
    FLAT = "FLAT"


class NotificationType(StrEnum):
    BOOKING = "BOOKING"
    OFFER = "OFFER"
    SYSTEM = "SYSTEM"


class SeatLockStatus(StrEnum):
    ACTIVE = "ACTIVE"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"
