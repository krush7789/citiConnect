from typing import Any

from app.schema.common import PaginatedResponse, PaginationParams


def build_paginated_response(
    items: list[Any],
    *,
    page: int,
    page_size: int,
    total: int,
) -> dict[str, Any]:
    params = PaginationParams(page=page, page_size=page_size)
    response = PaginatedResponse.create(items, params=params, total=total)
    return response.model_dump()
