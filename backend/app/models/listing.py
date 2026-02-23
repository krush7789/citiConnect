from sqlalchemy import (
    Boolean,
    Column,
    Enum,
    Float,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ListingStatus, ListingType


class Listing(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listings"
    __table_args__ = (
        Index("ix_listings_city_type_status", "city_id", "type", "status"),
        Index("ix_listings_popularity", "popularity_score"),
    )

    type = Column(Enum(ListingType, name="listing_type"), nullable=False, index=True)
    title = Column(String(250), nullable=False, index=True)
    description = Column(Text, nullable=True)

    city_id = Column(
        PGUUID(as_uuid=True), ForeignKey("cities.id"), nullable=False, index=True
    )
    venue_id = Column(
        PGUUID(as_uuid=True), ForeignKey("venues.id"), nullable=False, index=True
    )

    price_min = Column(Numeric(12, 2), nullable=True)
    price_max = Column(Numeric(12, 2), nullable=True)

    category = Column(String(100), nullable=True, index=True)
    cover_image_url = Column(String(512), nullable=True)
    gallery_image_urls = Column(JSONB, nullable=True)

    is_featured = Column(Boolean, nullable=False, default=False, server_default="false")
    offer_text = Column(String(255), nullable=True)
    popularity_score = Column(Float, nullable=False, default=0.0, server_default="0")

    vibe_tags = Column(JSONB, nullable=True)
    metadata_json = Column("metadata", JSONB, nullable=True)

    status = Column(
        Enum(ListingStatus, name="listing_status"),
        nullable=False,
        default=ListingStatus.DRAFT,
        server_default=ListingStatus.DRAFT.value,
    )

    created_by = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )

    city = relationship("City", back_populates="listings")
    venue = relationship("Venue", back_populates="listings")
    created_by_user = relationship("User", back_populates="listings")
    occurrences = relationship("Occurrence", back_populates="listing")
    wishlists = relationship("Wishlist", back_populates="listing")
