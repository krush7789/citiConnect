from sqlalchemy import Boolean, Column, Enum, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import UserRole


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    name = Column(String(120), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(30), unique=True, nullable=True, index=True)
    profile_image_url = Column(String(512), nullable=True)
    role = Column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.USER,
        server_default=UserRole.USER.value,
    )
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    is_temporary_password = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    listings = relationship("Listing", back_populates="created_by_user")
    bookings = relationship("Booking", back_populates="user")
    wishlists = relationship("Wishlist", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    seat_locks = relationship("SeatLock", back_populates="user")
    offer_usages = relationship("UserOfferUsage", back_populates="user")
    admin_actions = relationship("AdminAuditLog", back_populates="admin_user")
