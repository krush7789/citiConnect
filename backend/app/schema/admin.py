from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    BookingStatus,
    DiscountType,
    ListingStatus,
    ListingType,
    OccurrenceStatus,
    VenueType,
)


# ---------------------------------------------------------------------------
# Reusable validator helpers
# ---------------------------------------------------------------------------

def _strip_or_none(v: str | None) -> str | None:
    """Strip whitespace; convert empty string to None."""
    if v is None:
        return None
    cleaned = v.strip()
    return cleaned or None


def _title_case(v: str) -> str:
    """Collapse whitespace, then capitalise each word."""
    compact = " ".join(str(v or "").strip().split())
    if not compact:
        return ""
    return " ".join(
        token[:1].upper() + token[1:].lower() if token else ""
        for token in compact.split(" ")
    )


def _title_case_or_none(v: str | None) -> str | None:
    """Title-case a string; return None if empty after cleaning."""
    if v is None:
        return None
    result = _title_case(v)
    return result or None


def _clean_string_list(v: list[str] | None) -> list[str] | None:
    """Strip items, drop empties; convert empty list to None."""
    if not v:
        return None
    cleaned = [item.strip() for item in v if isinstance(item, str) and item.strip()]
    return cleaned or None


def _ensure_dict(v: Any) -> dict[str, Any]:
    """Guarantee a dict; default to {} if not a dict."""
    return v if isinstance(v, dict) else {}


def _coerce_discount_type(v: Any) -> DiscountType:
    """Normalise discount_type strings: strip, upper, alias PERCENTAGE→PERCENT."""
    if isinstance(v, DiscountType):
        return v
    candidate = str(v).strip().upper()
    if candidate == "PERCENTAGE":
        candidate = "PERCENT"
    return DiscountType(candidate)


def _normalize_limit(v: int | None) -> int | None:
    """Convert zero or negative limits to None."""
    if v is None or v <= 0:
        return None
    return v


def _strip_upper(v: str | None) -> str | None:
    """Strip and upper-case a string (preserve empty string for field constraints)."""
    if v is None:
        return None
    return v.strip().upper()


def _strip_text(v: str | None) -> str | None:
    """Strip whitespace only (no case change)."""
    if v is None:
        return None
    return v.strip()


def _ensure_seat_layout(v: Any) -> Any | None:
    """Only accept dict or list for seat layout."""
    if isinstance(v, (dict, list)):
        return v
    return None


def _normalize_ticket_pricing(v: dict[str, Any] | None) -> dict[str, float] | None:
    """Normalise ticket pricing keys to upper-case, values to float."""
    if not isinstance(v, dict):
        return None
    normalized: dict[str, float] = {}
    for key, value in v.items():
        key_text = str(key).strip().upper()
        if not key_text or value is None:
            continue
        try:
            normalized[key_text] = float(value)
        except (TypeError, ValueError):
            continue
    return normalized or None


# ---------------------------------------------------------------------------
# Request schemas — Offers
# ---------------------------------------------------------------------------

class OfferCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    discount_type: DiscountType
    discount_value: Decimal = Field(gt=0)
    min_order_value: Decimal | None = None
    max_discount_value: Decimal | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool = True
    applicability: dict[str, Any] | None = None

    @field_validator("code", mode="before")
    @classmethod
    def _upper_code(cls, v: Any) -> Any:
        return _strip_upper(v)

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: Any) -> Any:
        return _strip_text(v)

    @field_validator("discount_type", mode="before")
    @classmethod
    def _coerce_dt(cls, v: Any) -> Any:
        return _coerce_discount_type(v)

    @field_validator("usage_limit", "user_usage_limit", mode="before")
    @classmethod
    def _norm_limit(cls, v: Any) -> Any:
        return _normalize_limit(v)


class OfferUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=80)
    title: str | None = Field(default=None, min_length=2, max_length=180)
    discount_type: DiscountType | None = None
    discount_value: Decimal | None = Field(default=None, gt=0)
    min_order_value: Decimal | None = None
    max_discount_value: Decimal | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool | None = None
    applicability: dict[str, Any] | None = None

    @field_validator("code", mode="before")
    @classmethod
    def _upper_code(cls, v: Any) -> Any:
        return _strip_upper(v)

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: Any) -> Any:
        return _strip_text(v)

    @field_validator("discount_type", mode="before")
    @classmethod
    def _coerce_dt(cls, v: Any) -> Any:
        if v is None:
            return None
        return _coerce_discount_type(v)

    @field_validator("usage_limit", "user_usage_limit", mode="before")
    @classmethod
    def _norm_limit(cls, v: Any) -> Any:
        return _normalize_limit(v)


class CityCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    image_url: str | None = Field(default=None, max_length=512)
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def _tc_name(cls, v: Any) -> Any:
        return _title_case(v)

    @field_validator("state", mode="before")
    @classmethod
    def _tc_state(cls, v: Any) -> Any:
        return _title_case_or_none(v)

    @field_validator("image_url", mode="before")
    @classmethod
    def _strip_image(cls, v: Any) -> Any:
        return _strip_or_none(v)


class CityUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    image_url: str | None = Field(default=None, max_length=512)
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _tc_name(cls, v: Any) -> Any:
        if v is None:
            return None
        return _title_case(v)

    @field_validator("state", mode="before")
    @classmethod
    def _tc_state(cls, v: Any) -> Any:
        return _title_case_or_none(v)

    @field_validator("image_url", mode="before")
    @classmethod
    def _strip_image(cls, v: Any) -> Any:
        return _strip_or_none(v)


class VenueCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    city_id: UUID
    address: str | None = Field(default=None, max_length=400)
    venue_type: VenueType
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def _tc_name(cls, v: Any) -> Any:
        return _title_case(v)

    @field_validator("address", mode="before")
    @classmethod
    def _strip_addr(cls, v: Any) -> Any:
        return _strip_or_none(v)


class VenueUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    city_id: UUID | None = None
    address: str | None = Field(default=None, max_length=400)
    venue_type: VenueType | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _tc_name(cls, v: Any) -> Any:
        if v is None:
            return None
        return _title_case(v)

    @field_validator("address", mode="before")
    @classmethod
    def _strip_addr(cls, v: Any) -> Any:
        return _strip_or_none(v)


class ListingCreateRequest(BaseModel):
    type: ListingType
    title: str = Field(min_length=2, max_length=250)
    description: str | None = None
    city_id: UUID | None = None
    venue_id: UUID | None = None
    category: str | None = Field(default=None, max_length=100)
    price_min: Decimal | None = Field(default=None, ge=0)
    price_max: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default="INR", min_length=1, max_length=10)
    status: ListingStatus = ListingStatus.DRAFT
    is_featured: bool = False
    offer_text: str | None = Field(default=None, max_length=255)
    cover_image_url: str | None = Field(default=None, max_length=512)
    gallery_image_urls: list[str] | None = None
    metadata: dict[str, Any] | None = None
    vibe_tags: list[str] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _tc_title(cls, v: Any) -> Any:
        return _title_case(v)

    @field_validator("description", "category", "offer_text", "cover_image_url", mode="before")
    @classmethod
    def _strip_opt(cls, v: Any) -> Any:
        return _strip_or_none(v)

    @field_validator("gallery_image_urls", "vibe_tags", mode="before")
    @classmethod
    def _clean_list(cls, v: Any) -> Any:
        return _clean_string_list(v)

    @field_validator("metadata", mode="before")
    @classmethod
    def _dict_meta(cls, v: Any) -> Any:
        return _ensure_dict(v)


class ListingUpdateRequest(BaseModel):
    type: ListingType | None = None
    title: str | None = Field(default=None, min_length=2, max_length=250)
    description: str | None = None
    city_id: UUID | None = None
    venue_id: UUID | None = None
    category: str | None = Field(default=None, max_length=100)
    price_min: Decimal | None = Field(default=None, ge=0)
    price_max: Decimal | None = Field(default=None, ge=0)
    status: ListingStatus | None = None
    is_featured: bool | None = None
    offer_text: str | None = Field(default=None, max_length=255)
    cover_image_url: str | None = Field(default=None, max_length=512)
    gallery_image_urls: list[str] | None = None
    metadata: dict[str, Any] | None = None
    vibe_tags: list[str] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _tc_title(cls, v: Any) -> Any:
        if v is None:
            return None
        return _title_case(v)

    @field_validator("description", "category", "offer_text", "cover_image_url", mode="before")
    @classmethod
    def _strip_opt(cls, v: Any) -> Any:
        return _strip_or_none(v)

    @field_validator("gallery_image_urls", "vibe_tags", mode="before")
    @classmethod
    def _clean_list(cls, v: Any) -> Any:
        return _clean_string_list(v)

    @field_validator("metadata", mode="before")
    @classmethod
    def _dict_meta(cls, v: Any) -> Any:
        if v is None:
            return None
        return _ensure_dict(v)


class OccurrenceCreateItem(BaseModel):
    start_time: datetime
    end_time: datetime | None = None
    venue_id: UUID
    provider_sub_location: str | None = Field(default=None, max_length=180)
    capacity_total: int = Field(gt=0)
    ticket_pricing: dict[str, Any] | None = None
    seat_layout: Any | None = None

    @field_validator("provider_sub_location", mode="before")
    @classmethod
    def _tc_sub(cls, v: Any) -> Any:
        return _title_case_or_none(v)

    @field_validator("ticket_pricing", mode="before")
    @classmethod
    def _norm_pricing(cls, v: Any) -> Any:
        if v is None:
            return None
        return _ensure_dict(v)

    @field_validator("seat_layout", mode="before")
    @classmethod
    def _norm_layout(cls, v: Any) -> Any:
        return _ensure_seat_layout(v)


class OccurrenceCreateRequest(BaseModel):
    occurrences: list[OccurrenceCreateItem] = Field(min_length=1)


class OccurrenceUpdateRequest(BaseModel):
    start_time: datetime | None = None
    end_time: datetime | None = None
    venue_id: UUID | None = None
    provider_sub_location: str | None = Field(default=None, max_length=180)
    capacity_total: int | None = Field(default=None, gt=0)
    ticket_pricing: dict[str, Any] | None = None
    seat_layout: Any | None = None
    status: OccurrenceStatus | None = None

    @field_validator("provider_sub_location", mode="before")
    @classmethod
    def _tc_sub(cls, v: Any) -> Any:
        return _title_case_or_none(v)

    @field_validator("ticket_pricing", mode="before")
    @classmethod
    def _norm_pricing(cls, v: Any) -> Any:
        if v is None:
            return None
        return _ensure_dict(v)

    @field_validator("seat_layout", mode="before")
    @classmethod
    def _norm_layout(cls, v: Any) -> Any:
        return _ensure_seat_layout(v)


class OccurrenceCancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=250)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip_reason(cls, v: Any) -> Any:
        return _strip_or_none(v)


class AdminDashboardStats(BaseModel):
    total_listings: int
    active_listings: int
    total_bookings: int
    bookings_today: int
    active_users: int
    total_revenue: float


class AdminDashboardRecentBooking(BaseModel):
    id: UUID
    user_name: str
    listing_title: str
    quantity: int
    final_price: float
    status: BookingStatus
    created_at: datetime


class AdminDashboardTopListing(BaseModel):
    id: UUID
    title: str
    total_bookings: int


class AdminDashboardAnalyticsSeriesRow(BaseModel):
    bucket_start: datetime
    bucket_label: str
    new_users: int
    revenue: float
    transacting_users: int
    arpu: float | None = None
    attendance: int
    new_users_growth_rate_pct: float | None = None
    revenue_growth_rate_pct: float | None = None


class AdminDashboardRevenueSourceItem(BaseModel):
    key: str
    revenue: float
    bookings: int
    transacting_users: int


class AdminDashboardAnalyticsBreakdowns(BaseModel):
    revenue_sources: list[AdminDashboardRevenueSourceItem] = Field(default_factory=list)


class AdminDashboardDrillResponse(BaseModel):
    metric: str
    columns: list[str]
    items: list[dict[str, Any]]
    page: int
    page_size: int
    total: int
    total_pages: int


class AdminDashboardResponse(BaseModel):
    stats: AdminDashboardStats
    recent_bookings: list[AdminDashboardRecentBooking]
    top_listings: list[AdminDashboardTopListing]
    analytics_series: list[AdminDashboardAnalyticsSeriesRow] = Field(default_factory=list)
    analytics_breakdowns: AdminDashboardAnalyticsBreakdowns | None = None


class AdminListingListItem(BaseModel):
    id: UUID
    type: ListingType
    title: str
    city: str
    city_id: UUID
    status: ListingStatus
    total_bookings: int
    created_at: datetime
    offer_text: str
    is_featured: bool


class AdminListingDetailItem(BaseModel):
    id: UUID
    type: ListingType
    title: str
    description: str
    city_id: UUID | None = None
    city: str
    venue_id: UUID | None = None
    venue_name: str | None = None
    address: str | None = None
    category: str
    price_min: float | None = None
    price_max: float | None = None
    currency: str
    status: ListingStatus
    is_featured: bool
    offer_text: str
    cover_image_url: str | None = None
    gallery_image_urls: list[str]
    metadata: dict[str, Any]
    vibe_tags: list[str]
    is_nationwide: bool
    created_at: datetime
    updated_at: datetime


class AdminListingDetailResponse(BaseModel):
    listing: AdminListingDetailItem


class AdminListingCreateResult(BaseModel):
    id: UUID
    status: ListingStatus


class AdminListingCreateResponse(BaseModel):
    message: str
    listing: AdminListingCreateResult


class AdminListingUpdateResult(BaseModel):
    id: UUID
    title: str
    offer_text: str
    is_featured: bool
    status: ListingStatus


class AdminListingUpdateResponse(BaseModel):
    message: str
    listing: AdminListingUpdateResult


class AdminOccurrenceItem(BaseModel):
    id: UUID
    listing_id: UUID
    city_id: UUID
    venue_id: UUID
    venue_name: str | None = None
    start_time: datetime
    end_time: datetime | None = None
    provider_sub_location: str | None = None
    capacity_total: int
    capacity_remaining: int
    ticket_pricing: dict[str, float] | None = None
    seat_layout: Any | None = None
    status: OccurrenceStatus


class AdminOccurrenceCreateResult(BaseModel):
    id: UUID
    status: OccurrenceStatus


class AdminOccurrenceCreateResponse(BaseModel):
    message: str
    occurrences: list[AdminOccurrenceCreateResult]


class AdminOccurrenceUpdateResponse(BaseModel):
    message: str
    occurrence: AdminOccurrenceItem


class AdminOccurrenceCancelResponse(BaseModel):
    message: str
    occurrence_id: UUID


class AdminBookingUser(BaseModel):
    id: UUID | None = None
    name: str
    email: str


class AdminBookingItem(BaseModel):
    id: UUID
    user: AdminBookingUser
    listing_title: str
    listing_type: ListingType | None = None
    occurrence_start: datetime | None = None
    quantity: int
    final_price: float
    status: BookingStatus | None = None
    created_at: datetime | None = None


class AdminOfferItem(BaseModel):
    id: UUID
    code: str
    title: str
    description: str | None = None
    discount_type: DiscountType
    discount_value: float
    min_order_value: float | None = None
    max_discount_value: float | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool
    applicability: dict[str, Any]


class AdminOfferMutationResult(BaseModel):
    id: UUID
    code: str
    is_active: bool


class AdminOfferMutationResponse(BaseModel):
    message: str
    offer: AdminOfferMutationResult


class AdminAuditLogItem(BaseModel):
    id: UUID
    admin_user: str
    action: str
    entity_type: str
    entity_id: str
    diff: dict[str, Any]
    created_at: datetime


class AdminVenueItem(BaseModel):
    id: UUID
    name: str
    city_id: UUID
    address: str | None = None
    venue_type: VenueType
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool


class AdminCityItem(BaseModel):
    id: UUID
    name: str
    state: str | None = None
    image_url: str | None = None
    is_active: bool


class AdminVenueCreateResponse(BaseModel):
    message: str
    venue: AdminVenueItem


class AdminCityMutationResponse(BaseModel):
    message: str
    city: AdminCityItem
