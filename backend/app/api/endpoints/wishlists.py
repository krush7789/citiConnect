from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependency import get_current_user
from app.schema.common import MessageResponse, PaginatedResponse
from app.schema.listing import ListingItem
from app.schema.wishlist import WishlistCreateRequest
from app.services.wishlists import (
    add_listing_to_wishlist,
    get_wishlist_page,
    remove_listing_from_wishlist,
)

router = APIRouter(prefix="/wishlists", tags=["wishlists"])


@router.get("", response_model=PaginatedResponse[ListingItem])
async def get_wishlist(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_wishlist_page(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MessageResponse)
async def add_to_wishlist(
    payload: WishlistCreateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await add_listing_to_wishlist(
        db,
        user_id=current_user.id,
        listing_id=payload.listing_id,
    )


@router.delete("/{listing_id}", response_model=MessageResponse)
async def remove_from_wishlist(
    listing_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await remove_listing_from_wishlist(
        db,
        user_id=current_user.id,
        listing_id=listing_id,
    )
