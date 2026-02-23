from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import SeatLockStatus


class SeatLock(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "seat_locks"
    __table_args__ = (
        Index(
            "ix_seat_locks_occurrence_status_expires",
            "occurrence_id",
            "status",
            "expires_at",
        ),
    )

    occurrence_id = Column(
        PGUUID(as_uuid=True), ForeignKey("occurrences.id"), nullable=False, index=True
    )
    seat_id = Column(String(20), nullable=False)
    user_id = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    expires_at = Column(DateTime(), nullable=False)
    status = Column(
        Enum(SeatLockStatus, name="seat_lock_status"),
        nullable=False,
        default=SeatLockStatus.ACTIVE,
        server_default=SeatLockStatus.ACTIVE.value,
    )

    occurrence = relationship("Occurrence", back_populates="seat_locks")
    user = relationship("User", back_populates="seat_locks")


