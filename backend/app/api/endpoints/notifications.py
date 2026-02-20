from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.models.enums import NotificationType
from app.repository.notification import (
    list_user_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)
from app.schema.common import PaginatedResponse
from app.schema.notification import (
    NotificationItem,
    NotificationMarkAllReadResponse,
    NotificationMarkReadResponse,
)
from app.utils.pagination import build_paginated_response

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedResponse[NotificationItem])
async def get_notifications(
    type: NotificationType | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_user_notifications(
        db,
        user_id=current_user.id,
        notification_type=type,
        is_read=is_read,
        page=page,
        page_size=page_size,
    )
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


@router.patch("/{notification_id}/read", response_model=NotificationMarkReadResponse)
async def mark_one_notification_read(
    notification_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notification = await mark_notification_read(
        db,
        user_id=current_user.id,
        notification_id=notification_id,
    )
    if notification is None:
        raise_api_error(404, "NOT_FOUND", "Notification not found")

    await db.commit()
    return {
        "message": "Notification marked as read",
        "notification_id": notification.id,
    }


@router.patch("/read-all", response_model=NotificationMarkAllReadResponse)
async def mark_all_notifications_as_read(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated_count = await mark_all_notifications_read(db, user_id=current_user.id)
    await db.commit()
    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }
