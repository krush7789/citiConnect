from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ListingType
from app.models.offer import Offer


async def list_offers_for_master(
    db: AsyncSession,
    *,
    now: datetime,
    current_only: bool,
    code_query: str | None,
    search_query: str | None,
    city_id: UUID | None,
    offer_type: ListingType | None,
    page: int,
    page_size: int,
) -> tuple[list[Offer], int]:
    stmt = select(Offer)
    count_stmt = select(func.count(Offer.id))

    if current_only:
        current_predicates = (
            Offer.is_active.is_(True),
            or_(Offer.valid_from.is_(None), Offer.valid_from <= now),
            or_(Offer.valid_until.is_(None), Offer.valid_until >= now),
        )
        stmt = stmt.where(*current_predicates)
        count_stmt = count_stmt.where(*current_predicates)

    if code_query:
        code_predicate = Offer.code.ilike(f"%{code_query}%")
        stmt = stmt.where(code_predicate)
        count_stmt = count_stmt.where(code_predicate)

    if search_query:
        query = f"%{search_query}%"
        search_predicate = or_(
            Offer.code.ilike(query),
            Offer.title.ilike(query),
            Offer.description.ilike(query),
        )
        stmt = stmt.where(search_predicate)
        count_stmt = count_stmt.where(search_predicate)

    if city_id is not None:
        city_filter = text(
            """
            (
              offers.applicability IS NULL
              OR NOT (offers.applicability ? 'city_ids')
              OR jsonb_typeof(offers.applicability->'city_ids') <> 'array'
              OR jsonb_array_length(offers.applicability->'city_ids') = 0
              OR (offers.applicability->'city_ids') ? :city_id
            )
            """
        )
        stmt = stmt.where(city_filter).params(city_id=str(city_id))
        count_stmt = count_stmt.where(city_filter).params(city_id=str(city_id))

    if offer_type is not None:
        type_filter = text(
            """
            (
              offers.applicability IS NULL
              OR NOT (offers.applicability ? 'types')
              OR jsonb_typeof(offers.applicability->'types') <> 'array'
              OR jsonb_array_length(offers.applicability->'types') = 0
              OR (offers.applicability->'types') ? :offer_type
            )
            """
        )
        normalized_type = str(offer_type.value).upper()
        stmt = stmt.where(type_filter).params(offer_type=normalized_type)
        count_stmt = count_stmt.where(type_filter).params(offer_type=normalized_type)

    stmt = stmt.order_by(Offer.valid_until.asc().nulls_last(), Offer.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    return rows, total
