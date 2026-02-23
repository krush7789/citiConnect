from sqlalchemy import Boolean, Column, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import NotificationType


class Notification(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "notifications"

    user_id = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    title = Column(String(200), nullable=False)
    body = Column(String(1000), nullable=False)
    type = Column(Enum(NotificationType, name="notification_type"), nullable=False)
    reference_id = Column(String(100), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, server_default="false")

    user = relationship("User", back_populates="notifications")
