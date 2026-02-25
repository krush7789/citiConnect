from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/citi_connect"
    )
    jwt_secret: str = Field(default="change-me")
    jwt_algorithm: str = Field(default="HS256")
    access_token_expire_seconds: int = Field(default=3600)
    refresh_token_expire_seconds: int = Field(default=7 * 24 * 3600)
    app_name: str = Field(default="CitiConnect Backend")
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")
    enable_scheduler: bool = Field(default=True)
    refresh_cookie_secure: bool = Field(default=False)
    refresh_cookie_samesite: str = Field(default="lax")

    geocoding_provider: str = Field(default="nominatim")
    geocoding_base_url: str = Field(
        default="https://nominatim.openstreetmap.org/search"
    )
    geocoding_api_key: str | None = Field(default=None)

    map_provider: str = Field(default="openstreetmap")
    map_api_base_url: str = Field(default="https://tile.openstreetmap.org")
    map_api_key: str | None = Field(default=None)

    cloudinary_cloud_name: str | None = Field(default=None)
    cloudinary_api_key: str | None = Field(default=None)
    cloudinary_api_secret: str | None = Field(default=None)
    cloudinary_upload_preset: str | None = Field(default=None)
    cloudinary_folder: str = Field(default="citiconnect")

    smtp_host: str | None = Field(default=None)
    smtp_port: int = Field(default=587)
    smtp_username: str | None = Field(default=None)
    smtp_password: str | None = Field(default=None)
    smtp_from_email: str = Field(default="no-reply@citiconnect.local")
    smtp_from_name: str = Field(default="CitiConnect")
    smtp_use_tls: bool = Field(default=True)
    smtp_use_ssl: bool = Field(default=False)
    smtp_timeout_seconds: int = Field(default=20)

    razorpay_key_id: str | None = Field(default="rzp_test_dummy_key")
    razorpay_key_secret: str | None = Field(default="dummy_secret")
    razorpay_webhook_secret: str | None = Field(default="dummy_webhook_secret")
    razorpay_base_url: str = Field(default="https://api.razorpay.com/v1")
    razorpay_mode: str = Field(default="auto")

    @property
    def normalized_database_url(self) -> str:
        if (
            self.database_url.startswith("postgresql://")
            and "+asyncpg" not in self.database_url
        ):
            return self.database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        return self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
