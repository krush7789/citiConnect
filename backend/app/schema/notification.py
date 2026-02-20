from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import NotificationType


class NotificationItem(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    body: str
    type: NotificationType
    reference_id: str | None = None
    is_read: bool
    created_at: datetime


class NotificationMarkReadResponse(BaseModel):
    message: str
    notification_id: UUID


class NotificationMarkAllReadResponse(BaseModel):
    message: str
    updated_count: int
