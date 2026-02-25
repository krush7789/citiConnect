from __future__ import annotations

import base64
import binascii
from pathlib import Path

import cloudinary
import cloudinary.uploader

from app.core.config import settings
from app.core.errors import raise_api_error
from app.schema.media import UploadBase64Request

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
MIME_TYPE_TO_EXTENSIONS = {
    "image/jpeg": {"jpg", "jpeg"},
    "image/png": {"png"},
    "image/webp": {"webp"},
    "image/gif": {"gif"},
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

if settings.cloudinary_cloud_name:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def extract_payload_and_mime(content_base64: str) -> tuple[str, str | None]:
    if content_base64.startswith("data:") and ";base64," in content_base64:
        head, payload = content_base64.split(";base64,", 1)
        mime_type = head.replace("data:", "", 1).strip().lower() or None
        return payload.strip(), mime_type
    return content_base64.strip(), None


def _filename_extension(filename: str) -> str | None:
    suffix = Path(str(filename or "").strip()).suffix.lower().lstrip(".")
    return suffix or None


def _detect_mime_type(file_bytes: bytes) -> str | None:
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if file_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if file_bytes.startswith(b"RIFF") and len(file_bytes) >= 12 and file_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


async def upload_base64_media(payload: UploadBase64Request) -> dict:
    encoded_payload, mime_type = extract_payload_and_mime(payload.content_base64)
    extension = _filename_extension(payload.filename)
    if extension and extension not in ALLOWED_EXTENSIONS:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Unsupported image file extension",
            {"allowed_extensions": sorted(ALLOWED_EXTENSIONS)},
        )

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

    detected_mime_type = _detect_mime_type(file_bytes)
    if not detected_mime_type or detected_mime_type not in ALLOWED_MIME_TYPES:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Unsupported or invalid image content",
            {"allowed_mime_types": sorted(ALLOWED_MIME_TYPES)},
        )

    normalized_mime_type = (mime_type or detected_mime_type).strip().lower()
    if normalized_mime_type not in ALLOWED_MIME_TYPES:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Unsupported image MIME type",
            {"allowed_mime_types": sorted(ALLOWED_MIME_TYPES)},
        )

    if mime_type and normalized_mime_type != detected_mime_type:
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Image MIME type does not match file content",
        )

    if extension and extension not in MIME_TYPE_TO_EXTENSIONS.get(
        normalized_mime_type, set()
    ):
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Image extension does not match file content",
        )

    if not settings.cloudinary_cloud_name:
        raise_api_error(
            500,
            "SERVER_ERROR",
            "Cloudinary credentials are not configured in the server.",
        )

    folder = str(payload.folder or "general").strip()
    target_folder = f"{settings.cloudinary_folder}/{folder}".strip("/")
    data_uri = f"data:{normalized_mime_type};base64,{encoded_payload}"

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
            "mime_type": normalized_mime_type,
            "size": len(file_bytes),
        }
    except Exception as e:
        raise_api_error(
            500, "UPLOAD_FAILED", f"Failed to upload image to Cloudinary: {str(e)}"
        )
