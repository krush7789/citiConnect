from pydantic import BaseModel, Field


class UploadBase64Request(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=16)
    folder: str | None = Field(default=None, max_length=120)


class UploadBase64Response(BaseModel):
    url: str
    path: str
    mime_type: str
    size: int
