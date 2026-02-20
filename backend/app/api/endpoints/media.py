import base64
import binascii
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Request

from app.core.dependency import get_current_user
from app.core.errors import raise_api_error
from app.schema.media import UploadBase64Request, UploadBase64Response

router = APIRouter(prefix="/media", tags=["media"])

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def _sanitize_folder(raw: str | None) -> str:
    if not raw:
        return "general"
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", raw.strip().lower()).strip("-")
    return cleaned or "general"


def _extract_payload_and_mime(content_base64: str) -> tuple[str, str | None]:
    if content_base64.startswith("data:") and ";base64," in content_base64:
        head, payload = content_base64.split(";base64,", 1)
        mime_type = head.replace("data:", "", 1).strip().lower() or None
        return payload.strip(), mime_type
    return content_base64.strip(), None


def _guess_extension(filename: str, mime_type: str | None) -> str:
    filename_suffix = Path(filename).suffix.lower().lstrip(".")
    if filename_suffix in ALLOWED_EXTENSIONS:
        return filename_suffix

    if mime_type:
        mime_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        guessed = mime_map.get(mime_type.strip().lower())
        if guessed:
            return guessed

    raise_api_error(
        422,
        "VALIDATION_ERROR",
        "Unsupported file type",
        {"allowed_extensions": sorted(ALLOWED_EXTENSIONS)},
    )


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

    folder = _sanitize_folder(payload.folder)
    extension = _guess_extension(payload.filename, mime_type)
    stored_name = f"{uuid4().hex}.{extension}"

    target_dir = UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / stored_name
    target_path.write_bytes(file_bytes)

    relative_path = f"/uploads/{folder}/{stored_name}"
    base_url = str(request.base_url).rstrip("/")
    return {
        "url": f"{base_url}{relative_path}",
        "path": relative_path,
        "mime_type": mime_type or f"image/{extension}",
        "size": len(file_bytes),
    }
