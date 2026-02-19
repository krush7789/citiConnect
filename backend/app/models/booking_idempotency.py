from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin


class BookingIdempotency(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "booking_idempotency"

    key = Column(String(120), unique=True, nullable=False, index=True)
    booking_id = Column(PGUUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, index=True)

    booking = relationship("Booking", back_populates="idempotency_keys")
