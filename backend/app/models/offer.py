from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import DiscountType


class Offer(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "offers"

    code = Column(String(80), unique=True, nullable=False, index=True)
    title = Column(String(180), nullable=False)
    description = Column(String(500), nullable=True)

    discount_type = Column(Enum(DiscountType, name="discount_type"), nullable=False)
    discount_value = Column(Numeric(12, 2), nullable=False)
    min_order_value = Column(Numeric(12, 2), nullable=True)
    max_discount_value = Column(Numeric(12, 2), nullable=True)

    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)

    usage_limit = Column(Integer, nullable=True)
    user_usage_limit = Column(Integer, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    applicability = Column(JSONB, nullable=True)

    bookings = relationship("Booking", back_populates="applied_offer")
    usages = relationship("UserOfferUsage", back_populates="offer")


