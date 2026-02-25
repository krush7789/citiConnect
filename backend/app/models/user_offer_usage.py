from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class UserOfferUsage(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "user_offer_usage"

    user_id = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    offer_id = Column(
        PGUUID(as_uuid=True), ForeignKey("offers.id"), nullable=False, index=True
    )
    booking_id = Column(
        PGUUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, index=True
    )
    used_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="offer_usages")
    offer = relationship("Offer", back_populates="usages")
    booking = relationship("Booking", back_populates="offer_usages")


