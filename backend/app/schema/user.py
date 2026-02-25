from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import UserRole


class UpdateMeRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    profile_image_url: str | None = Field(default=None, max_length=512)


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
