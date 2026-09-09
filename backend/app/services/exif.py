from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from PIL import Image
from PIL.ExifTags import GPSTAGS, TAGS


def _ratio(value: Any) -> float:
    if hasattr(value, "numerator"):
        return float(value.numerator) / float(value.denominator or 1)
    if isinstance(value, tuple) and len(value) == 2:
        return float(value[0]) / float(value[1] or 1)
    return float(value)


def _gps_to_deg(values: Any, ref: str) -> float | None:
    try:
        deg, minutes, seconds = [_ratio(part) for part in values]
    except Exception:
        return None
    sign = -1 if ref in {"S", "W"} else 1
    return sign * (deg + minutes / 60 + seconds / 3600)


def extract_exif(image_bytes: bytes) -> dict:
    result: dict = {
        "latitude": None,
        "longitude": None,
        "captured_at": None,
        "camera_make": None,
        "camera_model": None,
        "source": [],
    }
    try:
        image = Image.open(BytesIO(image_bytes))
        raw = image.getexif()
    except Exception:
        return result
    if not raw:
        return result

    tagged = {TAGS.get(key, key): raw.get(key) for key in raw.keys()}
    make = tagged.get("Make")
    model = tagged.get("Model")
    if make:
        result["camera_make"] = str(make).strip()
        result["source"].append("camera")
    if model:
        result["camera_model"] = str(model).strip()

    stamp = tagged.get("DateTimeOriginal") or tagged.get("DateTime")
    if stamp:
        try:
            parsed = datetime.strptime(str(stamp), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
            result["captured_at"] = parsed
            result["source"].append("exif_time")
        except ValueError:
            pass

    gps_ifd = raw.get_ifd(0x8825) if hasattr(raw, "get_ifd") else None
    if gps_ifd:
        gps = {GPSTAGS.get(key, key): gps_ifd.get(key) for key in gps_ifd.keys()}
        lat = _gps_to_deg(gps.get("GPSLatitude"), str(gps.get("GPSLatitudeRef") or "N"))
        lon = _gps_to_deg(gps.get("GPSLongitude"), str(gps.get("GPSLongitudeRef") or "E"))
        if lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180:
            result["latitude"] = round(lat, 6)
            result["longitude"] = round(lon, 6)
            result["source"].append("exif_gps")
    return result
