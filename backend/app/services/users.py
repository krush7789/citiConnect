from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.user import User
from app.repository import users as users_repository
from app.schema.user import UpdateMeRequest


async def serialize_user(user: User) -> dict[str, Any]:
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
    return {"user": await serialize_user(current_user)}


async def update_me_profile(
    db: AsyncSession,
    *,
    payload: UpdateMeRequest,
    current_user: User,
) -> dict[str, Any]:
    if payload.name is not None:
        current_user.name = payload.name

    if "phone" in payload.model_fields_set:
        next_phone = payload.phone
        if next_phone:
            duplicate = await users_repository.find_user_id_by_phone_excluding_user(
                db,
                phone=next_phone,
                excluded_user_id=current_user.id,
            )
            if duplicate:
                raise_api_error(
                    409,
                    "DUPLICATE_PHONE",
                    "Phone number is already used by another account",
                )
        current_user.phone = next_phone

    if "profile_image_url" in payload.model_fields_set:
        current_user.profile_image_url = payload.profile_image_url

    await users_repository.commit(db)
    await users_repository.refresh_user(db, current_user)
    return {"user": await serialize_user(current_user)}

