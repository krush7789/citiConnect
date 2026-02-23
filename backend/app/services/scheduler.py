import logging
from datetime import datetime
from typing import Any

from app.core.database import _ensure_engine
from app.repository.booking import (
    expire_stale_seat_locks,
    restore_capacity_for_failed_bookings,
)
from app.services.popularity import recompute_popularity_for_all_listings

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except (
    ModuleNotFoundError
):  # pragma: no cover - dependency may be unavailable in some environments
    AsyncIOScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)
_scheduler: Any = None


async def _run_release_expired_seat_locks() -> None:
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        try:
            expired_count = await expire_stale_seat_locks(db, now=datetime.now())
            await db.commit()
            logger.info(
                "Scheduler job release_expired_seat_locks completed: %s", expired_count
            )
        except Exception:
            await db.rollback()
            logger.exception("Scheduler job release_expired_seat_locks failed")


async def _run_recompute_popularity_scores() -> None:
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        try:
            listing_count = await recompute_popularity_for_all_listings(db)
            await db.commit()
            logger.info(
                "Scheduler job recompute_popularity_scores completed: %s", listing_count
            )
        except Exception:
            await db.rollback()
            logger.exception("Scheduler job recompute_popularity_scores failed")


async def _run_restore_capacity_for_failed_bookings() -> None:
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        try:
            occurrence_count = await restore_capacity_for_failed_bookings(db)
            await db.commit()
            logger.info(
                "Scheduler job restore_capacity_for_failed_bookings completed: %s",
                occurrence_count,
            )
        except Exception:
            await db.rollback()
            logger.exception(
                "Scheduler job restore_capacity_for_failed_bookings failed"
            )


def start_scheduler() -> None:
    global _scheduler

    if AsyncIOScheduler is None:
        logger.warning(
            "APScheduler is not installed. Scheduled jobs are disabled. "
            "Install it with `pip install apscheduler` or set ENABLE_SCHEDULER=false."
        )
        return

    if _scheduler and _scheduler.running:
        return

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _run_release_expired_seat_locks,
        trigger="interval",
        minutes=1,
        id="release_expired_seat_locks",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_recompute_popularity_scores,
        trigger="interval",
        hours=1,
        id="recompute_popularity_scores",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_restore_capacity_for_failed_bookings,
        trigger="interval",
        minutes=5,
        id="restore_capacity_for_failed_bookings",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()

    _scheduler = scheduler
    logger.info("APScheduler started with %s jobs", len(scheduler.get_jobs()))


def shutdown_scheduler() -> None:
    global _scheduler

    if _scheduler is None:
        return

    if _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None

