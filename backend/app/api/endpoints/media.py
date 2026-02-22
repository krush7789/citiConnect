import base64
import binascii

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, Request

from app.core.config import settings
from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.schema.media import UploadBase64Request, UploadBase64Response

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

if settings.cloudinary_cloud_name:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def _extract_payload_and_mime(content_base64: str) -> tuple[str, str | None]:
    if content_base64.startswith("data:") and ";base64," in content_base64:
        head, payload = content_base64.split(";base64,", 1)
        mime_type = head.replace("data:", "", 1).strip().lower() or None
        return payload.strip(), mime_type
    return content_base64.strip(), None


@router.post("/upload-base64", response_model=UploadBase64Response)
async def upload_base64_image(
    payload: UploadBase64Request,
    request: Request,
    _: object = Depends(get_current_user),
):
    encoded_payload, mime_type = _extract_payload_and_mime(payload.content_base64)

    try:
        file_bytes = base64.b64decode(encoded_payload, validate=True)
    except (binascii.Error, ValueError):
        raise_api_error(422, "VALIDATION_ERROR", "Invalid base64 file payload")

    if not file_bytes:
        raise_api_error(422, "VALIDATION_ERROR", "Uploaded file is empty")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise_api_error(
            413,
            "PAYLOAD_TOO_LARGE",
            "Image file is too large",
            {"max_size_bytes": MAX_FILE_SIZE_BYTES},
        )

    if not settings.cloudinary_cloud_name:
        raise_api_error(
            500,
            "SERVER_ERROR",
            "Cloudinary credentials are not configured in the server.",
        )

    folder = str(payload.folder or "general").strip()
    target_folder = f"{settings.cloudinary_folder}/{folder}".strip("/")

    data_uri = f"data:{mime_type or 'image/jpeg'};base64,{encoded_payload}"

    try:
        response = cloudinary.uploader.upload(
            data_uri,
            folder=target_folder,
            resource_type="image",
        )
        secure_url = response.get("secure_url")
        public_id = response.get("public_id")

        return {
            "url": secure_url,
            "path": public_id,
            "mime_type": mime_type or "image/jpeg",
            "size": len(file_bytes),
        }
    except Exception as e:
        raise_api_error(
            500, "UPLOAD_FAILED", f"Failed to upload image to Cloudinary: {str(e)}"
        )
