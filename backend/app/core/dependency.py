from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import raise_api_error
from app.core.security import decode_token
from app.models.enums import UserRole
from app.repository.auth import get_user_by_id


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise_api_error(401, "UNAUTHORIZED", "Authentication required")

    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        raise_api_error(401, "UNAUTHORIZED", "Invalid or expired token")

    token_type = payload.get("type")
    if token_type != "access":
        raise_api_error(401, "UNAUTHORIZED", "Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise_api_error(401, "UNAUTHORIZED", "Invalid token payload")

    user = await get_user_by_id(db, UUID(user_id))
    if not user or not user.is_active:
        raise_api_error(401, "UNAUTHORIZED", "User not found or inactive")

    return user


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        return None

    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await get_user_by_id(db, UUID(user_id))
        return user if user and user.is_active else None
    except Exception:
        return None


async def require_admin(current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise_api_error(403, "FORBIDDEN", "You do not have access to this resource")
    return current_user
