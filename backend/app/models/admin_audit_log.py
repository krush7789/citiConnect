from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPrimaryKeyMixin


class AdminAuditLog(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "admin_audit_logs"

    admin_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=False)
    diff = Column(JSONB, nullable=True)

    admin_user = relationship("User", back_populates="admin_actions")
