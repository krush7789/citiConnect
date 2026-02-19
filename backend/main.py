from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.api.router import router
from app.core.config import settings
from app.core.database import create_tables
from app.core.errors import add_exception_handlers

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


@app.on_event("startup")
async def startup_event() -> None:
    await create_tables()


@app.get("/")
async def read_root():
    return {"message": "CitiConnect backend is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
