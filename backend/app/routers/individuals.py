from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.auth import can_name, get_current_user, require_roles
from app.roles import canonical_role
from app.db import get_db
from app.models import CoatEmbedding, Detection, Follow, Individual, NamingClaim, User
from app.schemas import ClaimDecision, IndividualOut, MergeIndividualsRequest, NameRequest, NamingClaimOut, SharePatch
from app.services.identity import assert_name_free, audit, name_key
from app.services.monitoring import monitoring_map
from app.services.serialize import claim_out, individual_out

router = APIRouter(prefix="/api", tags=["individuals"])


@router.get("/individuals", response_model=list[IndividualOut])
def list_individuals(
    q: str | None = None,
    species: str | None = None,
    project_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[IndividualOut]:
    stmt = select(Individual).options(selectinload(Individual.project)).order_by(Individual.code)
    if project_id:
        stmt = stmt.where(Individual.project_id == project_id)
    rows = db.scalars(stmt).all()
    stats = monitoring_map(db, [row.id for row in rows])
    results = [individual_out(db, row, stats.get(row.id)) for row in rows]
    if q:
        needle = q.casefold()
        results = [row for row in results if needle in row.display_name.casefold() or needle in row.code.casefold()]
    if species:
        results = [row for row in results if row.species == species]
    return results


@router.get("/individuals/{code}", response_model=IndividualOut)
def get_individual(
    code: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IndividualOut:
    individual = db.scalar(
        select(Individual).options(selectinload(Individual.project)).where(Individual.code == code)
    )
    if not individual:
        individual = db.get(Individual, code)
    if not individual:
        raise HTTPException(status_code=404, detail="Individual not found")
    return individual_out(db, individual)


@router.post("/individuals/{individual_id}/name", response_model=NamingClaimOut)
def propose_name(
    individual_id: str,
    payload: NameRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NamingClaimOut:
    if not can_name(user):
        raise HTTPException(status_code=403, detail="Only verified researchers can name individuals")
    individual = db.get(Individual, individual_id)
    if not individual:
        raise HTTPException(status_code=404, detail="Individual not found")
    if individual.identity_status == "named":
        raise HTTPException(status_code=400, detail="This individual already has a canonical name")
    key = assert_name_free(db, payload.name, individual.id)
    claim = NamingClaim(
        individual_id=individual.id,
        proposed_name=" ".join(payload.name.strip().split()),
        name_key=key,
        proposer_id=user.id,
        status="pending",
    )
    individual.identity_status = "under_review"
    db.add(claim)
    audit(db, user, "propose_name", "naming_claim", individual.id, claim.proposed_name)
    db.commit()
    db.refresh(claim)
    claim.individual = individual
    return claim_out(db, claim)


@router.patch("/individuals/{individual_id}/sharing", response_model=IndividualOut)
def patch_sharing(
    individual_id: str,
    payload: SharePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IndividualOut:
    if canonical_role(user.role) not in {"admin", "scientist"}:
        raise HTTPException(status_code=403, detail="Only scientists and admins can share individual profiles")
    individual = db.get(Individual, individual_id)
    if not individual:
        raise HTTPException(status_code=404, detail="Individual not found")
    individual.share_public = payload.share_public
    db.commit()
    loaded = db.scalar(
        select(Individual).options(selectinload(Individual.project)).where(Individual.id == individual.id)
    )
    return individual_out(db, loaded)


@router.get("/naming-claims", response_model=list[NamingClaimOut])
def list_claims(
    status: str = "pending",
    project_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[NamingClaimOut]:
    stmt = (
        select(NamingClaim)
        .options(selectinload(NamingClaim.individual))
        .where(NamingClaim.status == status)
        .order_by(NamingClaim.created_at.desc())
    )
    rows = db.scalars(stmt).all()
    if project_id:
        rows = [row for row in rows if row.individual and row.individual.project_id == project_id]
    return [claim_out(db, row) for row in rows]


@router.post("/individuals/merge", response_model=IndividualOut)
def merge_individuals(
    payload: MergeIndividualsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> IndividualOut:
    if payload.keep_id == payload.absorb_id:
        raise HTTPException(status_code=400, detail="Choose two different individuals")
    keep = db.get(Individual, payload.keep_id)
    absorb = db.get(Individual, payload.absorb_id)
    if not keep or not absorb:
        raise HTTPException(status_code=404, detail="Individual not found")
    if keep.project_id != absorb.project_id:
        raise HTTPException(status_code=400, detail="Can only merge individuals in the same project")
    if keep.species != absorb.species:
        raise HTTPException(status_code=400, detail="Can only merge the same species")

    db.execute(update(Detection).where(Detection.individual_id == absorb.id).values(individual_id=keep.id))
    db.execute(
        update(Detection)
        .where(Detection.suggested_individual_id == absorb.id)
        .values(suggested_individual_id=keep.id)
    )
    db.execute(update(CoatEmbedding).where(CoatEmbedding.individual_id == absorb.id).values(individual_id=keep.id))
    db.execute(update(NamingClaim).where(NamingClaim.individual_id == absorb.id).values(individual_id=keep.id))
    db.execute(update(Follow).where(Follow.individual_id == absorb.id).values(individual_id=keep.id))

    # Prefer keep's name; if keep is unnamed and absorb is named, take the name.
    if keep.identity_status != "named" and absorb.identity_status == "named" and absorb.name:
        keep.name = absorb.name
        keep.name_key = absorb.name_key
        keep.named_by_id = absorb.named_by_id
        keep.identity_status = "named"

    for field in ("embedding_left_json", "embedding_right_json"):
        if not getattr(keep, field) and getattr(absorb, field):
            setattr(keep, field, getattr(absorb, field))

    audit(db, user, "merge_individuals", "individual", keep.id, f"absorbed {absorb.code}")
    db.delete(absorb)
    db.commit()
    loaded = db.scalar(
        select(Individual).options(selectinload(Individual.project)).where(Individual.id == keep.id)
    )
    return individual_out(db, loaded)


@router.post("/naming-claims/{claim_id}/decision", response_model=NamingClaimOut)
def decide_claim(
    claim_id: str,
    payload: ClaimDecision,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> NamingClaimOut:
    claim = db.scalar(select(NamingClaim).options(selectinload(NamingClaim.individual)).where(NamingClaim.id == claim_id))
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Claim already decided")
    individual = claim.individual
    claim.approver_id = user.id
    claim.decided_at = datetime.now(timezone.utc)
    if payload.approve:
        assert_name_free(db, claim.proposed_name, individual.id)
        claim.status = "approved"
        individual.name = claim.proposed_name
        individual.name_key = name_key(claim.proposed_name)
        individual.named_by_id = claim.proposer_id
        individual.identity_status = "named"
        audit(db, user, "approve_name", "individual", individual.id, individual.name)
    else:
        claim.status = "rejected"
        individual.identity_status = "unnamed"
        audit(db, user, "reject_name", "naming_claim", claim.id, claim.proposed_name)
    db.commit()
    db.refresh(claim)
    return claim_out(db, claim)
