from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import UserRole


class UpdateMeRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    profile_image_url: str | None = Field(default=None, max_length=512)

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value: Any):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name cannot be empty")
        return cleaned

    @field_validator("phone", "profile_image_url", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None


class UserMeItem(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str | None = None
    profile_image_url: str | None = None
    role: UserRole
    is_active: bool


class UserMeResponse(BaseModel):
    user: UserMeItem
