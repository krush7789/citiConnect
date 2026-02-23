import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
import uvicorn

from app.api.router import router
from app.core.config import settings
from app.core.database import create_tables
from app.core.errors import add_exception_handlers
from app.services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)
app = FastAPI(title=settings.app_name)
add_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)
add_pagination(app)


@app.on_event("startup")
async def startup_event() -> None:
    await create_tables()
    if settings.enable_scheduler:
        start_scheduler()
    else:
        logger.info("Scheduler startup skipped because ENABLE_SCHEDULER is false.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    shutdown_scheduler()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
