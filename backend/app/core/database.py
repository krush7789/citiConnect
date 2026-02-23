import importlib
import pkgutil
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine: AsyncEngine | None = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None


def _ensure_engine() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    global engine, SessionLocal
    if engine is not None and SessionLocal is not None:
        return engine, SessionLocal

    try:
        engine = create_async_engine(
            settings.normalized_database_url,
            future=True,
            echo=False,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Database driver is missing. Install dependencies (for PostgreSQL async: asyncpg)."
        ) from exc

    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    return engine, SessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    _, session_factory = _ensure_engine()
    async with session_factory() as session:
        yield session


async def create_tables() -> None:
    # Import model modules to ensure SQLAlchemy metadata is populated even with empty __init__.py files.
    import app.models as models_package

    for _, module_name, _ in pkgutil.iter_modules(models_package.__path__):
        if module_name.startswith("__"):
            continue
        importlib.import_module(f"app.models.{module_name}")

    active_engine, _ = _ensure_engine()
    async with active_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
