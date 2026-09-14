"""Curated conservation / field partners not always present in ROR."""

from __future__ import annotations

# Local directory merged into institution search. Prefer these over fuzzy ROR noise.
PARTNER_ORGS: list[dict] = [
    {
        "id": "partner:grow-jungles",
        "name": "Grow Jungles",
        "country": "United States",
        "city": None,
        "types": ["nonprofit", "partner"],
        "acronyms": [],
        "aliases": ["grow jungles", "growjungles", "grow jungle"],
    },
    {
        "id": "partner:las-oncas",
        "name": "Las Oncas",
        "country": "United States",
        "city": None,
        "types": ["nonprofit", "partner"],
        "acronyms": [],
        "aliases": ["las oncas", "lasoncas", "oncas"],
    },
    {
        "id": "partner:osa-conservation",
        "name": "Osa Conservation",
        "country": "Costa Rica",
        "city": None,
        "types": ["nonprofit", "partner"],
        "acronyms": [],
        "aliases": ["osa conservation", "osa"],
    },
]


def match_partner_orgs(query: str, *, country: str | None = None, limit: int = 12) -> list[dict]:
    """Return partner orgs matching query (substring on name/aliases). Soft country boost only."""
    q = (query or "").strip().lower()
    if len(q) < 2:
        return []
    prefer_country = (country or "").strip().lower()
    scored: list[tuple[int, dict]] = []
    for org in PARTNER_ORGS:
        name = str(org["name"])
        haystacks = [name.lower(), *[str(a).lower() for a in org.get("aliases") or []]]
        if not any(q in h or h.startswith(q) for h in haystacks):
            continue
        score = 40  # Always above typical ROR ranking so partners surface first.
        if any(h == q or h.startswith(q) for h in haystacks):
            score += 10
        if name.lower().startswith(q):
            score += 5
        item_country = org.get("country")
        if prefer_country and item_country and prefer_country in str(item_country).lower():
            score += 6
        scored.append(
            (
                score,
                {
                    "id": org["id"],
                    "name": name,
                    "country": org.get("country"),
                    "city": org.get("city"),
                    "types": list(org.get("types") or []),
                    "acronyms": list(org.get("acronyms") or []),
                    "source": "partner",
                },
            )
        )
    scored.sort(key=lambda pair: (-pair[0], pair[1]["name"].lower()))
    return [row for _, row in scored[:limit]]
