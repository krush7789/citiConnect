from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.models.enums import NotificationType
from app.schema.common import PaginatedResponse
from app.schema.notification import (
    NotificationItem,
    NotificationMarkAllReadResponse,
    NotificationMarkReadResponse,
)
from app.services.notifications import (
    get_notifications_page,
    mark_all_as_read,
    mark_notification_as_read,
)

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
    return await get_notifications_page(
        db,
        user_id=current_user.id,
        type=type,
        is_read=is_read,
        page=page,
        page_size=page_size,
    )


@router.patch("/{notification_id}/read", response_model=NotificationMarkReadResponse)
async def mark_one_notification_read(
    notification_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await mark_notification_as_read(
        db,
        user_id=current_user.id,
        notification_id=notification_id,
    )


@router.patch("/read-all", response_model=NotificationMarkAllReadResponse)
async def mark_all_notifications_as_read(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await mark_all_as_read(
        db,
        user_id=current_user.id,
    )
