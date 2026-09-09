"""Species is a profile row. Jaguar is first; the schema is not jaguar-shaped."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SpeciesProfile

DEFAULT_SPECIES = "jaguar"

# Used when the profiles table is empty (fresh tests, first boot).
_FALLBACK: dict[str, dict] = {
    "jaguar": {
        "common_name": "Jaguar",
        "scientific_name": "Panthera onca",
        "id_prefix": "JAG",
        "pattern_bearing": True,
        "flank_required": True,
        "deployed": True,
        "sort_order": 1,
    },
    "ocelot": {
        "common_name": "Ocelot",
        "scientific_name": "Leopardus pardalis",
        "id_prefix": "OCE",
        "pattern_bearing": True,
        "flank_required": True,
        "deployed": False,
        "sort_order": 2,
    },
    "margay": {
        "common_name": "Margay",
        "scientific_name": "Leopardus wiedii",
        "id_prefix": "MAR",
        "pattern_bearing": True,
        "flank_required": True,
        "deployed": False,
        "sort_order": 3,
    },
}

SPECIES_SEED = [
    {"slug": slug, **meta}
    for slug, meta in sorted(_FALLBACK.items(), key=lambda item: item[1]["sort_order"])
]


def ensure_species_profiles(db: Session) -> None:
    existing = {row.slug for row in db.scalars(select(SpeciesProfile)).all()}
    for row in SPECIES_SEED:
        if row["slug"] in existing:
            continue
        db.add(SpeciesProfile(**row))
    db.flush()


def profile_for(db: Session, slug: str | None) -> SpeciesProfile | None:
    key = (slug or "").strip().lower()
    if not key:
        return None
    return db.scalar(select(SpeciesProfile).where(SpeciesProfile.slug == key))


def prefix_for(db: Session, slug: str | None) -> str:
    row = profile_for(db, slug)
    if row:
        return row.id_prefix
    key = (slug or "").strip().lower()
    meta = _FALLBACK.get(key) or _FALLBACK[DEFAULT_SPECIES]
    return str(meta["id_prefix"])


def is_identifiable_species(db: Session, slug: str | None) -> bool:
    """Pattern-bearing coats can be matched. Unknown/empty frames cannot."""
    row = profile_for(db, slug)
    if row:
        return bool(row.pattern_bearing)
    key = (slug or "").strip().lower()
    meta = _FALLBACK.get(key)
    return bool(meta and meta["pattern_bearing"])


def canonical_species(db: Session, slug: str | None) -> str:
    """Map a detection label onto a catalog species. Unknown stays jaguar-first."""
    if is_identifiable_species(db, slug):
        return (slug or DEFAULT_SPECIES).strip().lower()
    return DEFAULT_SPECIES


def scientific_name_for(db: Session, slug: str | None) -> str:
    row = profile_for(db, slug)
    if row and row.scientific_name:
        return row.scientific_name
    key = (slug or "").strip().lower()
    meta = _FALLBACK.get(key) or _FALLBACK[DEFAULT_SPECIES]
    return str(meta["scientific_name"])


def common_name_for(db: Session, slug: str | None) -> str:
    row = profile_for(db, slug)
    if row and row.common_name:
        return row.common_name
    key = (slug or "").strip().lower()
    meta = _FALLBACK.get(key) or _FALLBACK[DEFAULT_SPECIES]
    return str(meta["common_name"])


def require_jaguar(slug: str | None) -> str:
    """Patterns identity catalog is jaguar-only for this phase."""
    key = (slug or DEFAULT_SPECIES).strip().lower()
    if key != "jaguar":
        raise ValueError("Only jaguars (Panthera onca) can be matched or named in this catalog")
    return "jaguar"


def normalize_side(value: str | None) -> str:
    if not value:
        return "U"
    token = value.strip().upper()[:1]
    return token if token in {"L", "R", "U", "B"} else "U"
