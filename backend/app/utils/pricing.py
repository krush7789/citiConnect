from decimal import Decimal, ROUND_HALF_UP
from typing import Any

TWO_DP = Decimal("0.01")

def normalize_ticket_pricing(ticket_pricing: Any) -> dict[str, float] | None:
    if isinstance(ticket_pricing, dict):
        normalized = {
            str(k).strip().upper(): float(v)
            for k, v in ticket_pricing.items()
            if str(k).strip() and v is not None
        }
        return normalized or None

    if isinstance(ticket_pricing, list):
        normalized: dict[str, float] = {}
        for item in ticket_pricing:
            if not isinstance(item, dict):
                continue
            key_value = item.get("type") or item.get("key") or item.get("category")
            key = str(key_value).strip().upper() if key_value is not None else ""
            if not key:
                continue
            value = item.get("price")
            if value is None:
                value = item.get("amount")
            try:
                normalized[key] = float(value)
            except (TypeError, ValueError):
                continue
        return normalized or None

    return None


def ticket_price_map(ticket_pricing: Any) -> dict[str, Decimal]:
    if isinstance(ticket_pricing, dict):
        return {str(k).strip().upper(): Decimal(str(v)).quantize(TWO_DP, rounding=ROUND_HALF_UP) for k, v in ticket_pricing.items() if str(k).strip() and v is not None}

    if isinstance(ticket_pricing, list):
        mapped: dict[str, Decimal] = {}
        for item in ticket_pricing:
            if not isinstance(item, dict):
                continue
            key_value = item.get("type") or item.get("key") or item.get("category")
            key = str(key_value).strip().upper() if key_value is not None else ""
            if not key:
                continue
            value = item.get("price")
            if value is None:
                value = item.get("amount")
            mapped[key] = Decimal(str(value or 0)).quantize(TWO_DP, rounding=ROUND_HALF_UP)
        return mapped

    return {}
