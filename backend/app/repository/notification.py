from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType
from app.models.notification import Notification


async def list_user_notifications(
    db: AsyncSession,
    *,
    user_id: UUID,
    notification_type: NotificationType | None,
    is_read: bool | None,
    page: int,
    page_size: int,
) -> tuple[list[Notification], int]:
    stmt: Select[tuple[Notification]] = select(Notification).where(Notification.user_id == user_id)
    count_stmt = select(func.count(Notification.id)).where(Notification.user_id == user_id)

    if notification_type is not None:
        stmt = stmt.where(Notification.type == notification_type)
        count_stmt = count_stmt.where(Notification.type == notification_type)

    if is_read is not None:
        stmt = stmt.where(Notification.is_read == is_read)
        count_stmt = count_stmt.where(Notification.is_read == is_read)

    stmt = stmt.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    items = (await db.execute(stmt)).scalars().all()
    return items, total


async def get_user_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    notification_id: UUID,
) -> Notification | None:
    stmt = (
        select(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def mark_notification_read(
    db: AsyncSession,
    *,
    user_id: UUID,
    notification_id: UUID,
) -> Notification | None:
    notification = await get_user_notification(
        db,
        user_id=user_id,
        notification_id=notification_id,
    )
    if notification is None:
        return None

    if not notification.is_read:
        notification.is_read = True
    return notification


async def mark_all_notifications_read(
    db: AsyncSession,
    *,
    user_id: UUID,
) -> int:
    stmt = (
        select(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .order_by(Notification.created_at.desc())
    )
    items = (await db.execute(stmt)).scalars().all()
    for item in items:
        item.is_read = True
    return len(items)
