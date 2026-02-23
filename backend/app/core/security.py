import base64
import hmac
import json
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Any

import bcrypt

from app.core.config import settings


class TokenDecodeError(Exception):
    pass


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _sign(message: bytes) -> str:
    signature = hmac.new(settings.jwt_secret.encode("utf-8"), message, sha256).digest()
    return _b64url_encode(signature)


def _encode(payload: dict[str, Any]) -> str:
    header = {"alg": settings.jwt_algorithm, "typ": "JWT"}
    header_b64 = _b64url_encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    )
    signature_b64 = _sign(f"{header_b64}.{payload_b64}".encode("utf-8"))
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _decode(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise TokenDecodeError("Malformed token")

    header_b64, payload_b64, signature_b64 = parts
    expected_sig = _sign(f"{header_b64}.{payload_b64}".encode("utf-8"))
    if not hmac.compare_digest(signature_b64, expected_sig):
        raise TokenDecodeError("Invalid signature")

    payload_raw = _b64url_decode(payload_b64)
    payload = json.loads(payload_raw.decode("utf-8"))

    exp = payload.get("exp")
    if exp is None:
        raise TokenDecodeError("Token missing expiration")

    now_ts = int(datetime.now().timestamp())
    if int(exp) < now_ts:
        raise TokenDecodeError("Token expired")

    return payload


def create_access_token(
    payload: dict[str, Any], expires_in_seconds: int | None = None
) -> str:
    expires = datetime.now() + timedelta(
        seconds=expires_in_seconds or settings.access_token_expire_seconds
    )
    data = payload.copy()
    data["exp"] = int(expires.timestamp())
    data["type"] = "access"
    return _encode(data)


def create_refresh_token(
    payload: dict[str, Any], expires_in_seconds: int | None = None
) -> str:
    expires = datetime.now() + timedelta(
        seconds=expires_in_seconds or settings.refresh_token_expire_seconds
    )
    data = payload.copy()
    data["exp"] = int(expires.timestamp())
    data["type"] = "refresh"
    return _encode(data)


def decode_token(token: str) -> dict[str, Any]:
    return _decode(token)

