from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Detection, Individual, NamingClaim, User
from app.services.vision import cosine


def name_key(name: str) -> str:
    return " ".join(name.strip().split()).casefold()


def display_label(individual: Individual) -> str:
    return individual.name or individual.code


def next_code(db: Session, species: str) -> str:
    from app.services.species import prefix_for

    prefix = prefix_for(db, species)
    like = f"{prefix}-%"
    codes = db.scalars(select(Individual.code).where(Individual.code.like(like))).all()
    numbers = []
    for code in codes:
        part = code.split("-")[-1]
        if part.isdigit():
            numbers.append(int(part))
    n = max(numbers, default=0) + 1
    return f"{prefix}-{n:04d}"


def compute_grade(detection: Detection, *, flank_required: bool = False) -> str:
    has_when = detection.captured_at is not None
    has_where = detection.latitude is not None and detection.longitude is not None
    animal = detection.species not in {"unknown", "other_or_empty", "unreadable", "possible_felid"}
    side = (detection.side or "U").upper()
    flank_ok = (not flank_required) or side in {"L", "R"}
    # Match confirms stay below research-grade until a second reviewer signs off.
    # Legacy confirmed rows and newly created individuals are not blocked.
    dual_ok = getattr(detection, "review_state", None) != "awaiting_second_review"
    if not animal or (not has_when and not has_where):
        return "casual"
    if detection.individual_id and has_when and has_where and flank_ok and dual_ok:
        return "research_grade"
    if detection.individual_id:
        return "confirmed"
    return "needs_id"


def grade_detection(db: Session, detection: Detection) -> str:
    from app.services.species import profile_for

    profile = profile_for(db, detection.species)
    # Only enforce flank for the deployed pattern-bearing species (jaguar first).
    flank_required = bool(profile and profile.flank_required and profile.deployed)
    return compute_grade(detection, flank_required=flank_required)


def generalize(lat: float | None, lon: float | None, role: str, own: bool) -> tuple[float | None, float | None]:
    if lat is None or lon is None:
        return None, None
    if role == "admin" or own:
        return lat, lon
    if role in {"researcher", "scientist"}:
        return round(lat, 2), round(lon, 2)
    return round(lat, 1), round(lon, 1)


def ranked_candidates(
    db: Session,
    embedding: list[float],
    species: str,
    side: str,
    limit: int = 5,
    project_id: str | None = None,
) -> list[tuple[Individual, float]]:
    if not embedding:
        return []
    stmt = select(Individual).where(Individual.species == species)
    if project_id:
        stmt = stmt.where(Individual.project_id == project_id)
    rows = db.scalars(stmt).all()
    scored: list[tuple[Individual, float]] = []
    for individual in rows:
        blob = individual.embedding_left_json if side != "R" else individual.embedding_right_json
        if not blob:
            blob = individual.embedding_left_json or individual.embedding_right_json
        if not blob:
            continue
        score = cosine(embedding, json.loads(blob))
        scored.append((individual, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit]


def attach_embedding(individual: Individual, embedding: list[float], side: str) -> None:
    if not embedding:
        return
    field = "embedding_right_json" if side == "R" else "embedding_left_json"
    current = getattr(individual, field)
    if not current:
        setattr(individual, field, json.dumps(embedding))
        return
    stored = json.loads(current)
    blended = [(a + b) / 2 for a, b in zip(stored, embedding)]
    setattr(individual, field, json.dumps(blended))


def assert_name_free(db: Session, proposed: str, exclude_individual_id: str | None = None) -> str:
    key = name_key(proposed)
    if not key:
        raise HTTPException(status_code=400, detail="Name is required")
    stmt = select(Individual).where(Individual.name_key == key, Individual.identity_status == "named")
    existing = db.scalar(stmt)
    if existing and existing.id != exclude_individual_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"That name is already canonical for {existing.code}. Names cannot overlap.",
        )
    pending = db.scalar(
        select(NamingClaim).where(NamingClaim.name_key == key, NamingClaim.status == "pending")
    )
    if pending and pending.individual_id != exclude_individual_id:
        raise HTTPException(
            status_code=409,
            detail="That name is already pending approval for another individual.",
        )
    return key


def audit(db: Session, actor: User | None, action: str, entity: str, entity_id: str, detail: str | None = None) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            detail=detail,
        )
    )


def detection_count(db: Session, individual_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Detection).where(Detection.individual_id == individual_id)) or 0
