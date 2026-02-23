from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.enums import NotificationType
from app.repository.notifications import (
    list_user_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)
from app.utils.pagination import build_paginated_response


async def get_notifications_page(
    db: AsyncSession,
    *,
    user_id: UUID,
    type: NotificationType | None,
    is_read: bool | None,
    page: int,
    page_size: int,
) -> dict:
    items, total = await list_user_notifications(
        db,
        user_id=user_id,
        notification_type=type,
        is_read=is_read,
        page=page,
        page_size=page_size,
    )
    return build_paginated_response(items, page=page, page_size=page_size, total=total)


async def mark_notification_as_read(
    db: AsyncSession,
    *,
    user_id: UUID,
    notification_id: UUID,
) -> dict:
    notification = await mark_notification_read(
        db,
        user_id=user_id,
        notification_id=notification_id,
    )
    if notification is None:
        raise_api_error(404, "NOT_FOUND", "Notification not found")

    await db.commit()
    return {
        "message": "Notification marked as read",
        "notification_id": notification.id,
    }


async def mark_all_as_read(
    db: AsyncSession,
    *,
    user_id: UUID,
) -> dict:
    updated_count = await mark_all_notifications_read(db, user_id=user_id)
    await db.commit()
    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }
