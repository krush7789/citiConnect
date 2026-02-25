from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.user import User
from app.repository import users as users_repository
from app.schema.user import UpdateMeRequest


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def serialize_user(db: AsyncSession, user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "profile_image_url": user.profile_image_url,
        "role": user.role.value,
        "is_active": bool(user.is_active),
    }


async def get_me_profile(db: AsyncSession, current_user: User) -> dict[str, Any]:
    return {"user": await serialize_user(db, current_user)}


async def update_me_profile(
    db: AsyncSession,
    *,
    payload: UpdateMeRequest,
    current_user: User,
) -> dict[str, Any]:
    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise_api_error(
                422,
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": {"name": "Name cannot be empty"}},
            )
        current_user.name = cleaned_name

    if payload.phone is not None:
        cleaned_phone = normalize_optional_text(payload.phone)
        if cleaned_phone:
            duplicate = await users_repository.find_user_id_by_phone_excluding_user(
                db,
                phone=cleaned_phone,
                excluded_user_id=current_user.id,
            )
            if duplicate:
                raise_api_error(
                    409,
                    "DUPLICATE_PHONE",
                    "Phone number is already used by another account",
                )
        current_user.phone = cleaned_phone

    if payload.profile_image_url is not None:
        current_user.profile_image_url = normalize_optional_text(
            payload.profile_image_url
        )

    await users_repository.commit(db)
    await users_repository.refresh_user(db, current_user)
    return {"user": await serialize_user(db, current_user)}

