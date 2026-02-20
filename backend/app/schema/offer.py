from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import DiscountType


class OfferItem(BaseModel):
    id: UUID
    code: str
    title: str
    description: str | None = None
    discount_type: DiscountType
    discount_value: float
    min_order_value: float | None = None
    max_discount_value: float | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    usage_limit: int | None = None
    user_usage_limit: int | None = None
    is_active: bool
    is_current: bool
    applicability: dict[str, Any]
