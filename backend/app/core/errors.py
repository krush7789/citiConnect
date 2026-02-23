from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def raise_api_error(
    status_code: int, code: str, message: str, details: dict[str, Any] | None = None
) -> None:
    raise ApiError(status_code=status_code, code=code, message=message, details=details)


def _error_body(
    code: str, message: str, details: dict[str, Any] | None = None
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        }
    }


def add_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and {"code", "message"}.issubset(
            exc.detail.keys()
        ):
            details = exc.detail.get("details") or {}
            return JSONResponse(
                status_code=exc.status_code,
                content=_error_body(exc.detail["code"], exc.detail["message"], details),
            )

        message = str(exc.detail) if exc.detail else "Unexpected error"
        return JSONResponse(
            status_code=exc.status_code, content=_error_body("HTTP_ERROR", message, {})
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields: dict[str, str] = {}
        for error in exc.errors():
            loc = error.get("loc", [])
            key = ".".join([str(v) for v in loc if v != "body"])
            fields[key or "request"] = error.get("msg", "Invalid value")

        return JSONResponse(
            status_code=422,
            content=_error_body(
                "VALIDATION_ERROR",
                "Some fields are invalid",
                {"fields": fields},
            ),
        )
