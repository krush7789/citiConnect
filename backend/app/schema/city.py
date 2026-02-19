from uuid import UUID

from pydantic import BaseModel


class CityItem(BaseModel):
    id: UUID
    name: str
    state: str | None = None
    image_url: str | None = None
    is_active: bool
