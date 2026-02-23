import math
from typing import Any, Generic, Sequence, TypeVar, cast

from fastapi_pagination.bases import AbstractPage, AbstractParams, RawParams
from pydantic import BaseModel, ConfigDict, Field


T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class PaginationParams(BaseModel, AbstractParams):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=500)

    def to_raw_params(self) -> RawParams:
        return RawParams(
            limit=self.page_size,
            offset=(self.page - 1) * self.page_size,
        )


class PaginatedResponse(AbstractPage[T], Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    total_pages: int
    __params_type__ = PaginationParams

    @classmethod
    def create(
        cls,
        items: Sequence[T],
        params: AbstractParams,
        *,
        total: int | None = None,
        **_: Any,
    ) -> "PaginatedResponse[T]":
        pagination = cast(PaginationParams, params)
        resolved_total = total if total is not None else len(items)
        resolved_page_size = max(1, pagination.page_size)
        resolved_total_pages = (
            0
            if resolved_total <= 0
            else max(math.ceil(resolved_total / resolved_page_size), 1)
        )
        return cls(
            items=list(items),
            page=pagination.page,
            page_size=resolved_page_size,
            total=resolved_total,
            total_pages=resolved_total_pages,
        )


class MessageResponse(BaseModel):
    message: str


class GeocodeResponse(BaseModel):
    latitude: float
    longitude: float


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
