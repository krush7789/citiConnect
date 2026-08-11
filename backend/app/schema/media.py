from typing import Any

from pydantic import BaseModel, Field, field_validator


class UploadBase64Request(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=16)
    folder: str | None = Field(default=None, max_length=120)

    @field_validator("filename", "content_base64", mode="before")
    @classmethod
    def normalize_required_text(cls, value: Any):
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                raise ValueError("Field cannot be empty")
            return cleaned
        return value

    @field_validator("folder", mode="before")
    @classmethod
    def normalize_optional_folder(cls, value: Any):
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class UploadBase64Response(BaseModel):
    url: str
    path: str
    mime_type: str
    size: int
