from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import SpeciesProfile
from app.services.species import (
    canonical_species,
    ensure_species_profiles,
    is_identifiable_species,
    normalize_side,
    prefix_for,
)


def test_normalize_side():
    assert normalize_side("left") == "L"
    assert normalize_side("R") == "R"
    assert normalize_side(None) == "U"
    assert normalize_side("both") == "B"
    assert normalize_side("x") == "U"


def test_species_profiles_and_codes():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    try:
        ensure_species_profiles(db)
        jaguar = db.scalar(select(SpeciesProfile).where(SpeciesProfile.slug == "jaguar"))
        assert jaguar is not None
        assert jaguar.deployed is True
        assert jaguar.flank_required is True
        assert prefix_for(db, "jaguar") == "JAG"
        assert prefix_for(db, "ocelot") == "OCE"
        assert is_identifiable_species(db, "jaguar")
        assert not is_identifiable_species(db, "unknown")
        assert canonical_species(db, "unknown") == "jaguar"
        assert canonical_species(db, "margay") == "margay"
    finally:
        db.close()
