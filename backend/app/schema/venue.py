from uuid import UUID

from pydantic import BaseModel

from app.models.enums import VenueType


class VenueItem(BaseModel):
    id: UUID
    name: str
    city_id: UUID
    address: str | None = None
    venue_type: VenueType
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool
