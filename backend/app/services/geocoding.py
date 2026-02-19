import asyncio
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


def _perform_get(url: str) -> dict | list:
    request = Request(
        url,
        headers={
            "User-Agent": "CitiConnect/1.0 (backend geocoding service)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=10) as response:  # noqa: S310 - controlled provider URL from settings
        payload = response.read().decode("utf-8")
    return json.loads(payload)


async def geocode_address(address: str) -> tuple[float, float] | None:
    if not address.strip():
        return None

    provider = settings.geocoding_provider.lower().strip()
    if provider == "nominatim":
        params = {
            "q": address,
            "format": "jsonv2",
            "limit": 1,
        }
        if settings.geocoding_api_key:
            params["key"] = settings.geocoding_api_key

        url = f"{settings.geocoding_base_url}?{urlencode(params)}"
        try:
            data = await asyncio.to_thread(_perform_get, url)
            if isinstance(data, list) and data:
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                return lat, lon
        except Exception:
            return None

    return None
