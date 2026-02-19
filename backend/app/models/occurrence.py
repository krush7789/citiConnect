from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import OccurrenceStatus


class Occurrence(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "occurrences"
    __table_args__ = (
        Index("ix_occurrences_listing_time_status", "listing_id", "start_time", "status"),
    )

    listing_id = Column(PGUUID(as_uuid=True), ForeignKey("listings.id"), nullable=False, index=True)
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id"), nullable=False, index=True)
    city_id = Column(PGUUID(as_uuid=True), ForeignKey("cities.id"), nullable=False, index=True)

    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)

    provider_sub_location = Column(String(180), nullable=True)
    capacity_total = Column(Integer, nullable=False)
    capacity_remaining = Column(Integer, nullable=False)

    ticket_pricing = Column(JSONB, nullable=True)
    seat_layout = Column(JSONB, nullable=True)

    status = Column(
        Enum(OccurrenceStatus, name="occurrence_status"),
        nullable=False,
        default=OccurrenceStatus.SCHEDULED,
        server_default=OccurrenceStatus.SCHEDULED.value,
    )

    listing = relationship("Listing", back_populates="occurrences")
    venue = relationship("Venue", back_populates="occurrences")
    city = relationship("City", back_populates="occurrences")
    bookings = relationship("Booking", back_populates="occurrence")
    seat_locks = relationship("SeatLock", back_populates="occurrence")
