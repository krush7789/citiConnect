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

    return None


def ticket_price_map(ticket_pricing: Any) -> dict[str, Decimal]:
    if isinstance(ticket_pricing, dict):
        return {
            str(k).strip().upper(): Decimal(str(v)).quantize(
                TWO_DP, rounding=ROUND_HALF_UP
            )
            for k, v in ticket_pricing.items()
            if str(k).strip() and v is not None
        }

    return {}
