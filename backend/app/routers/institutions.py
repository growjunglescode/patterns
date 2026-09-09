from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/institutions", tags=["institutions"])

ROR_URL = "https://api.ror.org/v2/organizations"


def _display_name(item: dict) -> str:
    names = item.get("names") or []
    for row in names:
        types = set(row.get("types") or [])
        if "ror_display" in types:
            return str(row.get("value") or "").strip()
    for row in names:
        types = set(row.get("types") or [])
        if "label" in types and (row.get("lang") in {None, "en"}):
            return str(row.get("value") or "").strip()
    if names:
        return str(names[0].get("value") or "").strip()
    return ""


def _country(item: dict) -> str | None:
    for loc in item.get("locations") or []:
        details = loc.get("geonames_details") or {}
        name = details.get("country_name")
        if name:
            return str(name)
    return None


def _city(item: dict) -> str | None:
    for loc in item.get("locations") or []:
        details = loc.get("geonames_details") or {}
        name = details.get("name")
        if name:
            return str(name)
    return None


@router.get("/search")
def search_institutions(
    q: str = Query("", min_length=0, max_length=160),
    limit: int = Query(12, ge=1, le=25),
    affiliation: str | None = Query(None, description="university | institution"),
    _: User = Depends(get_current_user),
) -> dict:
    """Worldwide university / research-org lookup via Research Organization Registry (ROR)."""
    query = (q or "").strip()
    if len(query) < 2:
        return {"query": query, "results": []}

    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(ROR_URL, params={"query": query})
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach the institution directory") from exc

    preferred = (affiliation or "").strip().lower()
    prefer_education = preferred == "university"
    prefer_facility = preferred == "institution"

    ranked: list[tuple[int, dict]] = []
    for item in payload.get("items") or []:
        name = _display_name(item)
        if not name:
            continue
        types = [str(t).lower() for t in (item.get("types") or [])]
        score = 0
        if prefer_education and "education" in types:
            score += 5
        if prefer_facility and any(t in types for t in ("facility", "nonprofit", "government", "healthcare", "other")):
            score += 4
        if query.lower() in name.lower():
            score += 3
        if name.lower().startswith(query.lower()):
            score += 2
        ranked.append(
            (
                score,
                {
                    "id": item.get("id"),
                    "name": name,
                    "country": _country(item),
                    "city": _city(item),
                    "types": types,
                    "acronyms": [
                        str(row.get("value"))
                        for row in (item.get("names") or [])
                        if "acronym" in set(row.get("types") or []) and row.get("value")
                    ][:3],
                },
            )
        )

    ranked.sort(key=lambda pair: (-pair[0], pair[1]["name"].lower()))
    results = [row for _, row in ranked[:limit]]
    return {"query": query, "results": results}
