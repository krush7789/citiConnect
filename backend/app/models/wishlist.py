from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin


class Wishlist(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "wishlists"
    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_wishlist_user_listing"),
    )

    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(PGUUID(as_uuid=True), ForeignKey("listings.id"), nullable=False, index=True)

    user = relationship("User", back_populates="wishlists")
    listing = relationship("Listing", back_populates="wishlists")
