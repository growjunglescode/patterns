from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.models import User
from app.partner_orgs import match_partner_orgs

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
    affiliation: str | None = Query(None, description="university | institution | organization"),
    country: str | None = Query(
        None,
        description="Optional country name used only to boost ranking — never excludes matches",
    ),
    _: User = Depends(get_current_user),
) -> dict:
    """Partner directory first, then worldwide ROR lookup."""
    query = (q or "").strip()
    if len(query) < 2:
        return {"query": query, "results": []}

    partners = match_partner_orgs(query, country=country, limit=limit)
    partner_names = {str(row["name"]).casefold() for row in partners}

    payload: dict = {"items": []}
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(ROR_URL, params={"query": query})
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError:
        # Partners still usable offline / if ROR is down.
        if partners:
            return {"query": query, "prefer_country": country or None, "results": partners[:limit]}
        raise HTTPException(status_code=502, detail="Could not reach the institution directory")

    preferred = (affiliation or "").strip().lower()
    prefer_education = preferred == "university"
    prefer_facility = preferred == "institution"
    prefer_organization = preferred == "organization"
    prefer_country = (country or "").strip().lower()

    ranked: list[tuple[int, dict]] = []
    for item in payload.get("items") or []:
        name = _display_name(item)
        if not name:
            continue
        if name.casefold() in partner_names:
            continue
        types = [str(t).lower() for t in (item.get("types") or [])]
        item_country = _country(item)
        score = 0
        if prefer_education and "education" in types:
            score += 5
        if prefer_facility and any(t in types for t in ("facility", "nonprofit", "government", "healthcare", "other")):
            score += 4
        if prefer_organization and any(t in types for t in ("company", "nonprofit", "government", "facility", "other")):
            score += 5
        if prefer_country and item_country and prefer_country in item_country.lower():
            # Soft boost only — never drop non-matching countries.
            score += 6
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
                    "country": item_country,
                    "city": _city(item),
                    "types": types,
                    "acronyms": [
                        str(row.get("value"))
                        for row in (item.get("names") or [])
                        if "acronym" in set(row.get("types") or []) and row.get("value")
                    ][:3],
                    "source": "ror",
                },
            )
        )

    ranked.sort(key=lambda pair: (-pair[0], pair[1]["name"].lower()))
    ror_results = [row for _, row in ranked]
    results = (partners + ror_results)[:limit]
    return {"query": query, "prefer_country": country or None, "results": results}
