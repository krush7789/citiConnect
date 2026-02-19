from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.schema.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
)
from app.schema.common import MessageResponse
from app.services.auth import (
    change_password,
    forgot_password,
    login_user,
    refresh_access_token,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.refresh_token_expire_seconds,
        path="/",
    )


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    data, refresh_token = await register_user(
        db,
        name=payload.name,
        email=payload.email,
        password=payload.password,
    )
    _set_refresh_cookie(response, refresh_token)
    return data


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    data, refresh_token = await login_user(db, email=payload.email, password=payload.password)
    _set_refresh_cookie(response, refresh_token)
    return data


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    await forgot_password(db, email=payload.email)
    return {"message": "If an account with this email exists, a temporary password has been sent"}


@router.post("/change-password", response_model=MessageResponse)
async def change(
    payload: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await change_password(
        db,
        user_id=current_user.id,
        current_password=payload.current_password,
        new_password=payload.new_password,
        confirm_new_password=payload.confirm_new_password,
    )
    return {"message": "Password updated successfully"}


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise_api_error(401, "UNAUTHORIZED", "Refresh token is missing")

    data = await refresh_access_token(db, refresh_token)
    return data


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}
