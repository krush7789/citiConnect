from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import BookingStatus


class BookingLockRequest(BaseModel):
    occurrence_id: UUID
    seat_ids: list[str] | None = None
    seat_layout_version: int | None = None
    quantity: int | None = Field(default=None, ge=1)
    ticket_breakdown: dict[str, int] | None = None


class ApplyOfferRequest(BaseModel):
    coupon_code: str | None = None


class ConfirmBookingRequest(BaseModel):
    payment_method: str | None = None
    payment_payload: dict[str, Any] | None = None


class CancelBookingRequest(BaseModel):
    reason: str | None = None


class AppliedOfferRef(BaseModel):
    id: UUID
    code: str


class BookingItem(BaseModel):
    id: UUID
    user_id: UUID
    occurrence_id: UUID
    occurrence_start_time: datetime | None = None
    occurrence_end_time: datetime | None = None
    listing_snapshot: dict | None = None
    booked_seats: list[str] | None = None
    ticket_breakdown: dict | None = None
    quantity: int
    unit_price: Decimal | None = None
    total_price: Decimal | None = None
    base_amount: Decimal | None = None
    tax_amount: Decimal | None = None
    discount_amount: Decimal | None = None
    final_price: Decimal | None = None
    currency: str = "INR"
    status: BookingStatus
    payment_provider: str | None = None
    payment_ref: str | None = None
    cancellation_reason: str | None = None
    hold_expires_at: datetime | None = None
    can_confirm: bool = False
    can_cancel: bool = False
    cancellation_deadline: datetime | None = None
    created_at: datetime
    updated_at: datetime
    applied_offer: AppliedOfferRef | None = None


class BookingResponse(BaseModel):
    booking: BookingItem


class BookingCancelResponse(BaseModel):
    message: str
    booking_id: UUID
    refund_status: str | None = None


class RazorpayOrderItem(BaseModel):
    key_id: str
    order_id: str
    amount: int
    currency: str = "INR"
    booking_id: UUID
    mode: str


class RazorpayOrderResponse(BaseModel):
    payment: RazorpayOrderItem
