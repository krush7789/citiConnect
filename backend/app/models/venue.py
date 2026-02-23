from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import VenueType


class Venue(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "venues"
    __table_args__ = (Index("ix_venues_city_active", "city_id", "is_active"),)

    name = Column(String(180), nullable=False)
    city_id = Column(
        PGUUID(as_uuid=True), ForeignKey("cities.id"), nullable=False, index=True
    )
    address = Column(String(400), nullable=True)
    venue_type = Column(Enum(VenueType, name="venue_type"), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    city = relationship("City", back_populates="venues")
    listings = relationship("Listing", back_populates="venue")
    occurrences = relationship("Occurrence", back_populates="venue")
