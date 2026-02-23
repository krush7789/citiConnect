from fastapi import APIRouter, Depends

from app.core.dependency import get_current_user
from app.schema.media import UploadBase64Request, UploadBase64Response
from app.services.media import upload_base64_media

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/upload-base64", response_model=UploadBase64Response)
async def upload_base64_image(
    payload: UploadBase64Request,
    _: object = Depends(get_current_user),
):
    return await upload_base64_media(payload)
