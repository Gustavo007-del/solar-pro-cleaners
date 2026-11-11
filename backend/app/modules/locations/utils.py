from decimal import Decimal
from urllib.parse import urlencode


def google_maps_url(latitude: Decimal | None, longitude: Decimal | None) -> str | None:
    if (
        latitude is None or longitude is None
        or not latitude.is_finite() or not longitude.is_finite()
        or not (-90 <= latitude <= 90 and -180 <= longitude <= 180)
    ):
        return None
    query = urlencode({"api": 1, "query": f"{latitude:f},{longitude:f}"})
    return f"https://www.google.com/maps/search/?{query}"
