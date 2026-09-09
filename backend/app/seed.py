from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.species import ensure_species_profiles


def seed_if_empty(db: Session) -> None:
    """Demo catalog seeding is disabled — new installs start empty for real signup."""
    return


def ensure_reference_data(db: Session) -> None:
    """Idempotent reference rows (species profiles only)."""
    ensure_species_profiles(db)
    db.commit()
