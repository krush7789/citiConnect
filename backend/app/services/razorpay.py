import asyncio
import base64
import hashlib
import hmac
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from app.core.config import settings
from app.core.errors import raise_api_error

PLACEHOLDER_KEY_ID = "rzp_test_dummy_key"
PLACEHOLDER_KEY_SECRET = "dummy_secret"


def _has_real_credentials() -> bool:
    key_id = str(settings.razorpay_key_id or "").strip()
    key_secret = str(settings.razorpay_key_secret or "").strip()
    if not key_id or not key_secret:
        return False
    if key_id == PLACEHOLDER_KEY_ID or key_secret == PLACEHOLDER_KEY_SECRET:
        return False
    return True


def get_razorpay_mode() -> str:
    raw_mode = str(settings.razorpay_mode or "auto").strip().lower()
    if raw_mode == "dummy":
        return "dummy"
    if raw_mode == "live":
        return "live"
    return "live" if _has_real_credentials() else "dummy"


def is_live_mode() -> bool:
    return get_razorpay_mode() == "live"


def get_public_key_id() -> str:
    key_id = str(settings.razorpay_key_id or "").strip()
    return key_id or "rzp_test_dummy_key"


def _ensure_live_credentials() -> tuple[str, str]:
    key_id = str(settings.razorpay_key_id or "").strip()
    key_secret = str(settings.razorpay_key_secret or "").strip()
    if not key_id or not key_secret:
        raise_api_error(
            500,
            "PAYMENT_CONFIG_ERROR",
            "Razorpay credentials are not configured for live mode.",
        )
    return key_id, key_secret


def _normalize_notes(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    notes: dict[str, str] = {}
    for key, raw_item in value.items():
        text_key = str(key).strip()
        text_value = str(raw_item).strip()
        if not text_key or not text_value:
            continue
        notes[text_key[:40]] = text_value[:200]
    return notes


def _create_live_order_sync(
    *, amount_paise: int, currency: str, receipt: str, notes: dict[str, str]
) -> dict[str, Any]:
    key_id, key_secret = _ensure_live_credentials()
    auth_token = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode(
        "utf-8"
    )
    payload = {
        "amount": int(amount_paise),
        "currency": currency,
        "receipt": receipt,
        "notes": notes,
    }
    request = Request(
        f"{settings.razorpay_base_url.rstrip('/')}/orders",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=15) as response:  # noqa: S310 - controlled provider URL from settings
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        provider_body = exc.read().decode("utf-8", errors="ignore")
        raise_api_error(
            502,
            "PAYMENT_PROVIDER_ERROR",
            "Failed to create Razorpay order.",
            {
                "provider": "razorpay",
                "status_code": exc.code,
                "provider_response": provider_body[:500],
            },
        )
    except URLError as exc:
        raise_api_error(
            502,
            "PAYMENT_PROVIDER_ERROR",
            "Unable to reach Razorpay.",
            {"provider": "razorpay", "reason": str(exc.reason)},
        )

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise_api_error(
            502,
            "PAYMENT_PROVIDER_ERROR",
            "Invalid Razorpay response received.",
            {"provider": "razorpay"},
        )

    order_id = str(parsed.get("id") or "").strip()
    if not order_id:
        raise_api_error(
            502,
            "PAYMENT_PROVIDER_ERROR",
            "Razorpay response did not include an order id.",
            {"provider": "razorpay"},
        )

    return {
        "id": order_id,
        "amount": int(parsed.get("amount") or amount_paise),
        "currency": str(parsed.get("currency") or currency).strip().upper() or "INR",
    }


async def create_razorpay_order(
    *,
    amount_paise: int,
    currency: str = "INR",
    receipt: str,
    notes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    safe_amount = int(amount_paise)
    if safe_amount <= 0:
        raise_api_error(
            400, "VALIDATION_ERROR", "Payment amount must be greater than zero."
        )

    safe_currency = str(currency or "INR").strip().upper() or "INR"
    safe_notes = _normalize_notes(notes)
    safe_receipt = str(receipt or "").strip()[:40] or f"receipt_{uuid4().hex[:20]}"

    if not is_live_mode():
        return {
            "id": f"order_demo_{uuid4().hex[:20]}",
            "amount": safe_amount,
            "currency": safe_currency,
        }

    return await asyncio.to_thread(
        _create_live_order_sync,
        amount_paise=safe_amount,
        currency=safe_currency,
        receipt=safe_receipt,
        notes=safe_notes,
    )


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str) -> bool:
    safe_order_id = str(order_id or "").strip()
    safe_payment_id = str(payment_id or "").strip()
    safe_signature = str(signature or "").strip()
    if not safe_order_id or not safe_payment_id or not safe_signature:
        return False

    if not is_live_mode():
        return True

    _, key_secret = _ensure_live_credentials()
    signed_payload = f"{safe_order_id}|{safe_payment_id}".encode("utf-8")
    digest = hmac.new(
        key_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, safe_signature)
