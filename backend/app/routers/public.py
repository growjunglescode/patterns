from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from fastapi import Depends

from app.db import get_db
from app.models import Detection, Individual, User
from app.roles import canonical_role
from app.services.serialize import individual_out, media_out

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/people/{user_id}")
def public_person(user_id: str, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if not user or not bool(getattr(user, "profile_public", False)):
        raise HTTPException(status_code=404, detail="This profile is not shared")
    photos = db.scalar(select(func.count()).select_from(Detection).where(Detection.uploader_id == user.id)) or 0
    return {
        "id": user.id,
        "display_name": user.display_name,
        "role": canonical_role(user.role),
        "verified": user.verified,
        "organization": getattr(user, "organization", None),
        "bio": getattr(user, "bio", None),
        "orcid": user.orcid,
        "photo_count": int(photos),
    }


@router.get("/individuals/{code}")
def public_individual(code: str, db: Session = Depends(get_db)) -> dict:
    individual = db.scalar(
        select(Individual).options(selectinload(Individual.project)).where(Individual.code == code)
    )
    if not individual:
        individual = db.get(Individual, code)
    if not individual or not bool(getattr(individual, "share_public", False)):
        raise HTTPException(status_code=404, detail="This profile is not shared")
    detections = db.scalars(
        select(Detection)
        .options(selectinload(Detection.media), selectinload(Detection.station))
        .where(Detection.individual_id == individual.id)
        .order_by(Detection.created_at.desc())
        .limit(12)
    ).all()
    photos = []
    for det in detections:
        for item in det.media:
            if item.kind == "video":
                continue
            photos.append(
                {
                    "url": media_out(item).url,
                    "station": det.station.code if det.station else None,
                    "captured_at": det.captured_at.isoformat() if det.captured_at else None,
                }
            )
    out = individual_out(db, individual)
    payload = out.model_dump()
    # Public profiles show the animal, not who edited its record.
    payload.pop("details_updated_by", None)
    payload.pop("details_updated_at", None)
    return {
        **payload,
        "photos": photos[:8],
    }


@router.get("/jaguars/{code}")
def public_jaguar_compat(code: str, db: Session = Depends(get_db)) -> dict:
    """Backward-compatible alias for public individual profiles."""
    return public_individual(code, db)
