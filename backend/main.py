import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
import uvicorn

from app.api.router import router, v1_router
from app.core.config import settings
from app.core.database import create_tables
from app.core.errors import add_exception_handlers
from app.services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await create_tables()
    if settings.enable_scheduler:
        start_scheduler()
    else:
        logger.info("Scheduler startup skipped because ENABLE_SCHEDULER is false.")
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
add_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in settings.cors_origin_list else settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def normalize_api_path(request, call_next):
    raw_path = request.url.path
    if raw_path.startswith("/api"):
        if not raw_path.startswith("/api/v1") and raw_path != "/api":
            request.scope["path"] = "/api/v1" + raw_path[4:]
    elif raw_path.startswith("/v1"):
        request.scope["path"] = "/api" + raw_path
    elif (
        raw_path != "/"
        and not raw_path.startswith("/docs")
        and not raw_path.startswith("/openapi.json")
        and not raw_path.startswith("/health")
    ):
        request.scope["path"] = "/api/v1" + raw_path

    return await call_next(request)


@app.get("/")
@app.get("/api")
@app.get("/health")
@app.get("/v1/health")
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name}


app.include_router(router)
app.include_router(v1_router)
add_pagination(app)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
