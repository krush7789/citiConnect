from uuid import UUID

from pydantic import BaseModel


class WishlistCreateRequest(BaseModel):
    listing_id: UUID
