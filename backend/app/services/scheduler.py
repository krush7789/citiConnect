import logging
import zlib
from typing import Any

from app.core.database import _ensure_engine
from app.repository.booking import (
    expire_stale_holds,
    expire_stale_seat_locks,
    restore_capacity_for_failed_bookings,
)
from app.services.popularity import recompute_popularity_for_all_listings
from app.utils.datetime_utils import utcnow
from sqlalchemy import text

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except (
    ModuleNotFoundError
):  # pragma: no cover - dependency may be unavailable in some environments
    AsyncIOScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)
_scheduler: Any = None


def _job_lock_key(job_name: str) -> int:
    # Stable per-job lock key for PostgreSQL advisory locks.
    return zlib.crc32(f"citiconnect:{job_name}".encode("utf-8"))


async def _try_acquire_job_lock(db, job_name: str) -> bool:
    try:
        lock_key = _job_lock_key(job_name)
        acquired = await db.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": lock_key}
        )
        return bool(acquired.scalar_one())
    except Exception:
        logger.warning(
            "Advisory lock unavailable for scheduler job %s; proceeding without lock.",
            job_name,
        )
        return True


async def _release_job_lock(db, job_name: str) -> None:
    try:
        lock_key = _job_lock_key(job_name)
        await db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": lock_key})
    except Exception:
        logger.debug("Failed to release advisory lock for job %s", job_name)


async def _run_release_expired_seat_locks() -> None:
    job_name = "release_expired_seat_locks"
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        lock_acquired = await _try_acquire_job_lock(db, job_name)
        if not lock_acquired:
            logger.debug("Skipping scheduler job %s (lock held by another worker).", job_name)
            return
        try:
            expired_count = await expire_stale_seat_locks(db, now=utcnow())
            await db.commit()
            logger.info(
                "Scheduler job release_expired_seat_locks completed: %s", expired_count
            )
        except Exception:
            await db.rollback()
            logger.exception("Scheduler job release_expired_seat_locks failed")
        finally:
            await _release_job_lock(db, job_name)


async def _run_expire_stale_booking_holds() -> None:
    job_name = "expire_stale_booking_holds"
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        lock_acquired = await _try_acquire_job_lock(db, job_name)
        if not lock_acquired:
            logger.debug("Skipping scheduler job %s (lock held by another worker).", job_name)
            return
        try:
            expired_count = await expire_stale_holds(db, now=utcnow())
            await db.commit()
            logger.info(
                "Scheduler job expire_stale_booking_holds completed: %s", expired_count
            )
        except Exception:
            await db.rollback()
            logger.exception("Scheduler job expire_stale_booking_holds failed")
        finally:
            await _release_job_lock(db, job_name)


async def _run_recompute_popularity_scores() -> None:
    job_name = "recompute_popularity_scores"
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        lock_acquired = await _try_acquire_job_lock(db, job_name)
        if not lock_acquired:
            logger.debug("Skipping scheduler job %s (lock held by another worker).", job_name)
            return
        try:
            listing_count = await recompute_popularity_for_all_listings(db)
            await db.commit()
            logger.info(
                "Scheduler job recompute_popularity_scores completed: %s", listing_count
            )
        except Exception:
            await db.rollback()
            logger.exception("Scheduler job recompute_popularity_scores failed")
        finally:
            await _release_job_lock(db, job_name)


async def _run_restore_capacity_for_failed_bookings() -> None:
    job_name = "restore_capacity_for_failed_bookings"
    _, session_factory = _ensure_engine()
    async with session_factory() as db:
        lock_acquired = await _try_acquire_job_lock(db, job_name)
        if not lock_acquired:
            logger.debug("Skipping scheduler job %s (lock held by another worker).", job_name)
            return
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
        finally:
            await _release_job_lock(db, job_name)


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
        _run_expire_stale_booking_holds,
        trigger="interval",
        minutes=1,
        id="expire_stale_booking_holds",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
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

