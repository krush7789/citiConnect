from functools import lru_cache
from os import getenv
from pathlib import Path

from pydantic import BaseModel, Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError:
    class SettingsConfigDict(dict):
        pass

    class BaseSettings(BaseModel):
        model_config = SettingsConfigDict(extra="ignore")

        def __init__(self, **data):
            env_values: dict[str, str] = {}
            env_file = Path(__file__).resolve().parents[2] / ".env"
            if env_file.exists():
                for raw_line in env_file.read_text(encoding="utf-8").splitlines():
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    env_values[key.strip()] = value.strip().strip('"').strip("'")

            for field_name in self.__class__.model_fields:
                env_key = field_name.upper()
                if field_name in data:
                    continue
                env_val = getenv(env_key)
                if env_val is not None:
                    data[field_name] = env_val
                elif env_key in env_values:
                    data[field_name] = env_values[env_key]

            super().__init__(**data)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:5432/citi_connect")
    jwt_secret: str = Field(default="change-me")
    jwt_algorithm: str = Field(default="HS256")
    access_token_expire_seconds: int = Field(default=3600)
    refresh_token_expire_seconds: int = Field(default=7 * 24 * 3600)
    app_name: str = Field(default="CitiConnect Backend")
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    geocoding_provider: str = Field(default="nominatim")
    geocoding_base_url: str = Field(default="https://nominatim.openstreetmap.org/search")
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
    smtp_use_tls: bool = Field(default=True)

    razorpay_key_id: str | None = Field(default="rzp_test_dummy_key")
    razorpay_key_secret: str | None = Field(default="dummy_secret")
    razorpay_webhook_secret: str | None = Field(default="dummy_webhook_secret")
    razorpay_base_url: str = Field(default="https://api.razorpay.com/v1")
    razorpay_mode: str = Field(default="dummy")

    @property
    def normalized_database_url(self) -> str:
        if self.database_url.startswith("postgresql://") and "+asyncpg" not in self.database_url:
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
