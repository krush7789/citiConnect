from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import ListingStatus, ListingType, OccurrenceStatus


class CityRef(BaseModel):
    id: UUID
    name: str
    state: str | None = None


class VenueRef(BaseModel):
    id: UUID
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class NextOccurrence(BaseModel):
    id: UUID
    start_time: datetime
    capacity_remaining: int
    status: OccurrenceStatus


class ListingItem(BaseModel):
    id: UUID
    type: ListingType
    title: str
    category: str | None = None
    city: CityRef
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    offer_text: str | None = None
    is_wishlisted: bool = False
    next_occurrence: NextOccurrence | None = None
    distance_km: float | None = None


class ListingFiltersResponse(BaseModel):
    categories: list[str]
    vibe_tags: list[str]
    price_range: dict[str, float]


class OccurrenceItem(BaseModel):
    id: UUID
    start_time: datetime
    end_time: datetime | None = None
    capacity_remaining: int
    status: OccurrenceStatus
    ticket_pricing: dict[str, float] | None = None


class ListingDetail(BaseModel):
    id: UUID
    type: ListingType
    title: str
    description: str | None = None
    city: CityRef
    venue: VenueRef
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    category: str | None = None
    cover_image_url: str | None = None
    gallery_image_urls: list[str] | None = None
    offer_text: str | None = None
    vibe_tags: list[str] | None = None
    metadata: dict | None = None
    status: ListingStatus
    created_at: datetime
    updated_at: datetime


class ListingDetailResponse(BaseModel):
    listing: ListingDetail
    occurrences: list[OccurrenceItem]


class ListingOccurrencesResponse(BaseModel):
    items: list[OccurrenceItem]


class SeatState(BaseModel):
    seat_id: str
    category: str | None = None
    state: str


class SeatMapResponse(BaseModel):
    occurrence_id: UUID
    version: int
    seat_layout: dict
    seat_states: list[SeatState]
    ticket_pricing: dict[str, float] | None = None
