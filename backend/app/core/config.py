from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"
TRUE_VALUES = {"1", "true", "yes", "on"}
FALSE_VALUES = {"0", "false", "no", "off"}


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip()
    return normalized if normalized else default


def _env_optional_str(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return default


class Config:
    def __init__(self) -> None:
        self.database_url = _env_str(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/citi_connect",
        )
        self.jwt_secret = _env_str("JWT_SECRET", "change-me")
        self.jwt_algorithm = _env_str("JWT_ALGORITHM", "HS256")
        self.access_token_expire_seconds = _env_int(
            "ACCESS_TOKEN_EXPIRE_SECONDS", 3600
        )
        self.refresh_token_expire_seconds = _env_int(
            "REFRESH_TOKEN_EXPIRE_SECONDS", 7 * 24 * 3600
        )
        self.app_name = _env_str("APP_NAME", "CitiConnect Backend")
        self.cors_origins = _env_str(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
        self.enable_scheduler = _env_bool("ENABLE_SCHEDULER", True)
        self.refresh_cookie_secure = _env_bool("REFRESH_COOKIE_SECURE", False)
        self.refresh_cookie_samesite = _env_str("REFRESH_COOKIE_SAMESITE", "lax")

        self.geocoding_provider = _env_str("GEOCODING_PROVIDER", "nominatim")
        self.geocoding_base_url = _env_str(
            "GEOCODING_BASE_URL",
            "https://nominatim.openstreetmap.org/search",
        )
        self.geocoding_api_key = _env_optional_str("GEOCODING_API_KEY")

        self.cloudinary_cloud_name = _env_optional_str("CLOUDINARY_CLOUD_NAME")
        self.cloudinary_api_key = _env_optional_str("CLOUDINARY_API_KEY")
        self.cloudinary_api_secret = _env_optional_str("CLOUDINARY_API_SECRET")
        self.cloudinary_folder = _env_str("CLOUDINARY_FOLDER", "citiconnect")

        self.smtp_host = _env_optional_str("SMTP_HOST")
        self.smtp_port = _env_int("SMTP_PORT", 587)
        self.smtp_username = _env_optional_str("SMTP_USERNAME")
        self.smtp_password = _env_optional_str("SMTP_PASSWORD")
        self.smtp_from_email = _env_str(
            "SMTP_FROM_EMAIL", "no-reply@citiconnect.local"
        )
        self.smtp_from_name = _env_str("SMTP_FROM_NAME", "CitiConnect")
        self.smtp_use_tls = _env_bool("SMTP_USE_TLS", True)
        self.smtp_use_ssl = _env_bool("SMTP_USE_SSL", False)
        self.smtp_timeout_seconds = _env_int("SMTP_TIMEOUT_SECONDS", 20)

        self.razorpay_key_id = _env_optional_str("RAZORPAY_KEY_ID")
        self.razorpay_key_secret = _env_optional_str("RAZORPAY_KEY_SECRET")
        self.razorpay_webhook_secret = _env_optional_str("RAZORPAY_WEBHOOK_SECRET")
        self.razorpay_base_url = _env_str(
            "RAZORPAY_BASE_URL", "https://api.razorpay.com/v1"
        )
        self.razorpay_mode = _env_str("RAZORPAY_MODE", "auto")

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
def get_settings() -> Config:
    _load_env_file(ENV_FILE_PATH)
    return Config()


settings = get_settings()
