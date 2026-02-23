from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BookingStatus


class Booking(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_user_status", "user_id", "status"),
        Index("ix_bookings_occurrence_status", "occurrence_id", "status"),
    )

    user_id = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    occurrence_id = Column(
        PGUUID(as_uuid=True), ForeignKey("occurrences.id"), nullable=False, index=True
    )

    listing_snapshot = Column(JSONB, nullable=True)
    booked_seats = Column(JSONB, nullable=True)
    ticket_breakdown = Column(JSONB, nullable=True)

    quantity = Column(Integer, nullable=False, default=1, server_default="1")

    unit_price = Column(Numeric(12, 2), nullable=True)
    total_price = Column(Numeric(12, 2), nullable=True)

    applied_offer_id = Column(
        PGUUID(as_uuid=True), ForeignKey("offers.id"), nullable=True
    )
    discount_amount = Column(
        Numeric(12, 2), nullable=True, default=0, server_default="0"
    )
    final_price = Column(Numeric(12, 2), nullable=True)

    status = Column(
        Enum(BookingStatus, name="booking_status"),
        nullable=False,
        default=BookingStatus.HOLD,
        server_default=BookingStatus.HOLD.value,
    )

    payment_provider = Column(String(120), nullable=True)
    payment_ref = Column(String(150), nullable=True)

    cancellation_reason = Column(String(250), nullable=True)
    hold_expires_at = Column(DateTime(), nullable=True)

    user = relationship("User", back_populates="bookings")
    occurrence = relationship("Occurrence", back_populates="bookings")
    applied_offer = relationship("Offer", back_populates="bookings")
    offer_usages = relationship("UserOfferUsage", back_populates="booking")
    idempotency_keys = relationship("BookingIdempotency", back_populates="booking")


