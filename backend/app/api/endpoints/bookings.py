from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.schema.booking import (
    ApplyOfferRequest,
    BookingCancelResponse,
    BookingItem,
    BookingLockRequest,
    BookingResponse,
    CancelBookingRequest,
    ConfirmBookingRequest,
    RazorpayOrderResponse,
)
from app.schema.common import PaginatedResponse
from app.services.bookings import (
    apply_offer_to_booking as apply_offer_to_booking_service,
    cancel_booking as cancel_booking_service,
    confirm_booking as confirm_booking_service,
    create_booking_lock as create_booking_lock_service,
    create_razorpay_payment_order as create_razorpay_payment_order_service,
    get_booking_by_id as get_booking_by_id_service,
    get_bookings as get_bookings_service,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/locks", response_model=BookingResponse)
async def create_booking_lock(
    payload: BookingLockRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_booking_lock_service(payload, current_user=current_user, db=db)


@router.patch("/{booking_id}/offer", response_model=BookingResponse)
async def apply_offer_to_booking(
    booking_id: UUID,
    payload: ApplyOfferRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await apply_offer_to_booking_service(
        booking_id,
        payload,
        current_user=current_user,
        db=db,
    )


@router.post(
    "/{booking_id}/payments/razorpay/order", response_model=RazorpayOrderResponse
)
async def create_razorpay_payment_order(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_razorpay_payment_order_service(
        booking_id,
        current_user=current_user,
        db=db,
    )


@router.post("/{booking_id}/confirm", response_model=BookingResponse)
async def confirm_booking(
    booking_id: UUID,
    payload: ConfirmBookingRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    return await confirm_booking_service(
        booking_id,
        payload,
        current_user=current_user,
        db=db,
        x_idempotency_key=x_idempotency_key,
    )


@router.get("", response_model=PaginatedResponse[BookingItem])
async def get_bookings(
    scope: str = Query(default="upcoming"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_bookings_service(
        scope=scope,
        page=page,
        page_size=page_size,
        current_user=current_user,
        db=db,
    )


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_by_id(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_booking_by_id_service(
        booking_id,
        current_user=current_user,
        db=db,
    )


@router.patch("/{booking_id}/cancel", response_model=BookingCancelResponse)
async def cancel_booking(
    booking_id: UUID,
    payload: CancelBookingRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await cancel_booking_service(
        booking_id,
        payload,
        current_user=current_user,
        db=db,
    )
