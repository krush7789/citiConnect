from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import bcrypt
import jwt
from jwt.exceptions import PyJWTError as JWTError
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


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _decode(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise TokenDecodeError(str(exc) or "Invalid token") from exc
    except Exception as exc:
        raise TokenDecodeError("Invalid token") from exc

    exp = payload.get("exp")
    if exp is None:
        raise TokenDecodeError("Token missing expiration")

    try:
        exp_ts = int(exp)
    except (TypeError, ValueError):
        raise TokenDecodeError("Invalid token expiration")

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if exp_ts < now_ts:
        raise TokenDecodeError("Token expired")

    return payload


def create_access_token(
    payload: dict[str, Any], expires_in_seconds: int | None = None
) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        seconds=expires_in_seconds or settings.access_token_expire_seconds
    )
    data = payload.copy()
    data["exp"] = int(expires.timestamp())
    data["type"] = "access"
    return _encode(data)


def create_refresh_token(
    payload: dict[str, Any],
    expires_in_seconds: int | None = None,
    *,
    jti: str | None = None,
) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        seconds=expires_in_seconds or settings.refresh_token_expire_seconds
    )
    data = payload.copy()
    data["exp"] = int(expires.timestamp())
    data["type"] = "refresh"
    data["jti"] = (jti or uuid4().hex).strip()
    return _encode(data)


def decode_token(token: str) -> dict[str, Any]:
    return _decode(token)

