from sqlalchemy import Boolean, Column, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin


class City(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "cities"

    name = Column(String(120), unique=True, nullable=False, index=True)
    state = Column(String(120), nullable=True)
    image_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    listings = relationship("Listing", back_populates="city")
    occurrences = relationship("Occurrence", back_populates="city")
    venues = relationship("Venue", back_populates="city")
