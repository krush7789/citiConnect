from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import (
    BookingStatus,
    DiscountType,
    ListingStatus,
    ListingType,
    OccurrenceStatus,
    VenueType,
)


class OfferCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    discount_type: str
    discount_value: Decimal = Field(gt=0)
    min_order_value: Decimal | None = None
    max_discount_value: Decimal | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool = True
    applicability: dict[str, Any] | None = None


class OfferUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=80)
    title: str | None = Field(default=None, min_length=2, max_length=180)
    discount_type: str | None = None
    discount_value: Decimal | None = Field(default=None, gt=0)
    min_order_value: Decimal | None = None
    max_discount_value: Decimal | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool | None = None
    applicability: dict[str, Any] | None = None


class CityCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    image_url: str | None = Field(default=None, max_length=512)
    is_active: bool = True


class VenueCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    city_id: UUID
    address: str | None = Field(default=None, max_length=400)
    venue_type: VenueType
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool = True


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


class OccurrenceCreateItem(BaseModel):
    start_time: datetime
    end_time: datetime | None = None
    venue_id: UUID
    provider_sub_location: str | None = Field(default=None, max_length=180)
    capacity_total: int = Field(gt=0)
    ticket_pricing: dict[str, Any] | None = None
    seat_layout: Any | None = None


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


class OccurrenceCancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=250)


class AdminDashboardStats(BaseModel):
    total_listings: int
    active_listings: int
    total_bookings: int
    bookings_today: int
    bookings_this_week: int
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


class AdminDashboardCategorySales(BaseModel):
    category: str
    total_bookings: int
    total_sales: float


class AdminDashboardResponse(BaseModel):
    stats: AdminDashboardStats
    recent_bookings: list[AdminDashboardRecentBooking]
    top_listings: list[AdminDashboardTopListing]
    category_sales: list[AdminDashboardCategorySales]


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


class AdminVenueCreateResponse(BaseModel):
    message: str
    venue: AdminVenueItem
