import logging
import re
import secrets
import string
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import raise_api_error
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repository.auth import (
    create_user,
    get_user_by_email,
    get_user_by_id,
)
from app.services.email import send_forgot_password_email

PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$")
logger = logging.getLogger(__name__)


def ensure_password_policy(password: str) -> None:
    if not PASSWORD_POLICY.match(password):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Password does not meet policy requirements",
            {
                "fields": {
                    "password": "Must be at least 8 characters and include uppercase, lowercase, number, and special character"
                }
            },
        )


def _user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
    }


def _token_payload(user: User) -> dict[str, str]:
    return {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    }


def _normalize_email(value: str) -> str:
    return value.strip().lower()


async def register_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    confirm_password: str,
) -> tuple[dict, str]:
    if password != confirm_password:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"confirm_password": "Must match password"}},
        )

    ensure_password_policy(password)

    normalized_email = _normalize_email(email)
    existing = await get_user_by_email(db, normalized_email)
    if existing:
        raise_api_error(409, "EMAIL_ALREADY_EXISTS", "Email is already registered")

    user = await create_user(
        db,
        name=name.strip(),
        email=normalized_email,
        password_hash=hash_password(password),
    )
    access_token = create_access_token(
        _token_payload(user), settings.access_token_expire_seconds
    )
    refresh_token = create_refresh_token(
        {"sub": str(user.id)},
        settings.refresh_token_expire_seconds,
    )

    await db.commit()

    return (
        {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_seconds,
            "user": _user_payload(user),
        },
        refresh_token,
    )


async def login_user(
    db: AsyncSession, *, email: str, password: str
) -> tuple[dict, str]:
    normalized_email = _normalize_email(email)
    user = await get_user_by_email(db, normalized_email)
    if not user or not verify_password(password, user.password_hash):
        raise_api_error(401, "INVALID_CREDENTIALS", "Email or password is incorrect")

    if not user.is_active:
        raise_api_error(403, "USER_INACTIVE", "User account is inactive")

    access_token = create_access_token(
        _token_payload(user), settings.access_token_expire_seconds
    )
    refresh_token = create_refresh_token(
        {"sub": str(user.id)},
        settings.refresh_token_expire_seconds,
    )
    await db.commit()

    return (
        {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_seconds,
            "user": _user_payload(user),
        },
        refresh_token,
    )


async def forgot_password(db: AsyncSession, *, email: str) -> None:
    normalized_email = _normalize_email(email)
    user = await get_user_by_email(db, normalized_email)
    if not user:
        return

    previous_hash = user.password_hash
    alphabet = string.ascii_letters + string.digits + "@#$%!"
    reset_password = "".join(secrets.choice(alphabet) for _ in range(12))
    user.password_hash = hash_password(reset_password)
    await db.commit()

    sent = await send_forgot_password_email(
        to_email=user.email,
        recipient_name=user.name,
        reset_password=reset_password,
        fail_silently=True,
    )
    if sent:
        return

    logger.warning(
        "Forgot-password email delivery failed for user_id=%s; reverting password reset.",
        user.id,
    )
    user.password_hash = previous_hash
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception(
            "Failed to revert password reset for user_id=%s after email failure.",
            user.id,
        )


async def change_password(
    db: AsyncSession,
    *,
    user_id: UUID,
    current_password: str,
    new_password: str,
    confirm_new_password: str,
) -> None:
    user = await get_user_by_id(db, user_id)
    if not user:
        raise_api_error(404, "USER_NOT_FOUND", "User not found")

    if not verify_password(current_password, user.password_hash):
        raise_api_error(401, "INVALID_CREDENTIALS", "Current password is incorrect")

    if new_password != confirm_new_password:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"confirm_new_password": "Must match new_password"}},
        )

    if current_password == new_password:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Some fields are invalid",
            {"fields": {"new_password": "Must be different from current_password"}},
        )

    ensure_password_policy(new_password)

    user.password_hash = hash_password(new_password)
    await db.commit()

async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise_api_error(401, "UNAUTHORIZED", "Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise_api_error(401, "UNAUTHORIZED", "Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise_api_error(401, "UNAUTHORIZED", "Invalid token payload")

    try:
        user_uuid = UUID(str(user_id))
    except (TypeError, ValueError):
        raise_api_error(401, "UNAUTHORIZED", "Invalid token payload")

    user = await get_user_by_id(db, user_uuid)
    if not user or not user.is_active:
        raise_api_error(401, "UNAUTHORIZED", "User not found or inactive")

    access_token = create_access_token(
        _token_payload(user), settings.access_token_expire_seconds
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_seconds,
    }
