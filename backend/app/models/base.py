from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID


class UUIDPrimaryKeyMixin:
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)


class CreatedAtMixin:
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TimestampMixin(CreatedAtMixin):
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
