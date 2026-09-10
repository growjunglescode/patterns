from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.db import get_db
from app.models import (
    AuditLog,
    CameraStation,
    CoatEmbedding,
    Detection,
    Individual,
    MatchReview,
    Media,
    NamingClaim,
    Organization,
    Project,
    ProjectMember,
    SpeciesProfile,
    User,
)
from app.roles import canonical_role
from app.services.serialize import user_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _count(db: Session, model, *filters) -> int:
    stmt = select(func.count()).select_from(model)
    for item in filters:
        stmt = stmt.where(item)
    return int(db.scalar(stmt) or 0)


class ProjectAdminPatch(BaseModel):
    active: bool | None = None
    name: str | None = None
    region: str | None = None


class ProjectCreate(BaseModel):
    name: str
    region: str | None = None
    organization_id: str | None = None
    organization_name: str | None = None
    owner_user_id: str | None = None
    active: bool = True


class MemberCreate(BaseModel):
    user_id: str
    member_role: str = "researcher"


class HomeProjectPatch(BaseModel):
    project_id: str | None = None


class SpeciesAdminPatch(BaseModel):
    deployed: bool | None = None
    flank_required: bool | None = None
    common_name: str | None = None
    scientific_name: str | None = None


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> dict:
    now = datetime.now(timezone.utc)
    roles: dict[str, int] = defaultdict(int)
    affiliations: dict[str, int] = defaultdict(int)
    for user in db.scalars(select(User)).all():
        roles[canonical_role(user.role)] += 1
        affiliations[(user.affiliation_type or "unset")] += 1

    grades: dict[str, int] = defaultdict(int)
    for grade, n in db.execute(select(Detection.grade, func.count()).group_by(Detection.grade)).all():
        grades[grade or "unknown"] = int(n)

    identity: dict[str, int] = defaultdict(int)
    for status, n in db.execute(select(Individual.identity_status, func.count()).group_by(Individual.identity_status)).all():
        identity[status or "unknown"] = int(n)

    review_states: dict[str, int] = defaultdict(int)
    for state, n in db.execute(select(Detection.review_state, func.count()).group_by(Detection.review_state)).all():
        review_states[state or "unset"] = int(n)

    pending_claims = (
        db.scalars(
            select(NamingClaim)
            .where(NamingClaim.status == "pending")
            .order_by(NamingClaim.created_at.asc())
        ).all()
    )
    oldest_needs = db.scalar(
        select(Detection)
        .where(Detection.grade == "needs_id")
        .order_by(Detection.created_at.asc())
        .limit(1)
    )

    recent_audit = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(14)).all()
    actor_ids = {row.actor_id for row in recent_audit if row.actor_id}
    actors = {row.id: row for row in db.scalars(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}

    health: dict = {
        "engine_name": "unknown",
        "model_version": None,
        "recognition_engine_setting": "auto",
        "coat_model_path": None,
        "checkpoint_exists": False,
        "ready_for_train": False,
        "training_reason": None,
        "media_files": _count(db, Media),
    }
    try:
        from app.config import get_settings
        from app.export_train_set import assess_readiness
        from app.services.recognition.service import get_recognition_service
        from app.services.recognition.train_pipeline import status as train_status

        settings = get_settings()
        service = get_recognition_service()
        readiness = assess_readiness(db)
        pipe = train_status(db)
        health.update(
            {
                "engine_name": getattr(service.engine, "name", "unknown"),
                "model_version": getattr(service.engine, "model_version", None),
                "recognition_engine_setting": settings.recognition_engine,
                "coat_model_path": settings.coat_model_path or pipe.get("active", {}).get("coat_model_path"),
                "checkpoint_exists": bool(pipe.get("checkpoint_exists")),
                "ready_for_train": bool(readiness.ready_for_train),
                "training_reason": readiness.reason,
                "activated_at": (pipe.get("active") or {}).get("activated_at"),
            }
        )
    except Exception as exc:
        health["error"] = str(exc)

    return {
        "generated_at": now.isoformat(),
        "health": health,
        "totals": {
            "users": _count(db, User),
            "organizations": _count(db, Organization),
            "projects": _count(db, Project),
            "active_projects": _count(db, Project, Project.active.is_(True)),
            "stations": _count(db, CameraStation),
            "individuals": _count(db, Individual),
            "detections": _count(db, Detection),
            "media": _count(db, Media),
            "coat_embeddings": _count(db, CoatEmbedding),
            "naming_claims": _count(db, NamingClaim),
            "match_reviews": _count(db, MatchReview),
            "audit_events": _count(db, AuditLog),
        },
        "queues": {
            "pending_names": len(pending_claims),
            "needs_identification": _count(db, Detection, Detection.grade == "needs_id"),
            "awaiting_second_review": _count(db, Detection, Detection.review_state == "awaiting_second_review"),
            "unverified_scientists": _count(
                db, User, User.role.in_(["scientist", "researcher"]), User.verified.is_(False)
            ),
            "incomplete_onboarding": _count(db, User, User.onboarding_complete.is_(False)),
            "inactive_projects": _count(db, Project, Project.active.is_(False)),
            "public_individuals": _count(db, Individual, Individual.share_public.is_(True)),
        },
        "roles": dict(roles),
        "affiliations": dict(affiliations),
        "grades": dict(grades),
        "identity": dict(identity),
        "review_states": dict(review_states),
        "attention": {
            "oldest_pending_name": (
                {
                    "id": pending_claims[0].id,
                    "proposed_name": pending_claims[0].proposed_name,
                    "created_at": _iso(pending_claims[0].created_at),
                }
                if pending_claims
                else None
            ),
            "oldest_needs_id": (
                {
                    "id": oldest_needs.id,
                    "species": oldest_needs.species,
                    "created_at": _iso(oldest_needs.created_at),
                }
                if oldest_needs
                else None
            ),
        },
        "recent_audit": [
            {
                "id": row.id,
                "action": row.action,
                "entity": row.entity,
                "entity_id": row.entity_id,
                "detail": row.detail,
                "created_at": _iso(row.created_at),
                "actor_id": row.actor_id,
                "actor_name": actors[row.actor_id].display_name if row.actor_id and row.actor_id in actors else None,
            }
            for row in recent_audit
        ],
    }


@router.get("/people")
def people(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> list[dict]:
    photo_counts = dict(db.execute(select(Detection.uploader_id, func.count()).group_by(Detection.uploader_id)).all())
    review_counts = dict(
        db.execute(select(Detection.reviewer_id, func.count()).where(Detection.reviewer_id.is_not(None)).group_by(Detection.reviewer_id)).all()
    )
    members = db.scalars(select(ProjectMember)).all()
    projects = {row.id: row for row in db.scalars(select(Project)).all()}
    memberships: dict[str, list[dict]] = defaultdict(list)
    for member in members:
        project = projects.get(member.project_id)
        memberships[member.user_id].append(
            {
                "project_id": member.project_id,
                "project_name": project.name if project else None,
                "member_role": member.role,
            }
        )
    rows = []
    for user in db.scalars(select(User).order_by(User.created_at.desc())).all():
        base = user_out(user, int(photo_counts.get(user.id) or 0)).model_dump()
        home = projects.get(getattr(user, "home_project_id", None) or "")
        base.update(
            {
                "created_at": _iso(user.created_at),
                "review_count": int(review_counts.get(user.id) or 0),
                "home_project_name": home.name if home else None,
                "memberships": memberships.get(user.id, []),
            }
        )
        rows.append(base)
    return rows


@router.get("/estate")
def estate(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> dict:
    orgs = db.scalars(select(Organization).order_by(Organization.name)).all()
    projects = db.scalars(select(Project).order_by(Project.name)).all()
    stations = db.scalars(select(CameraStation).order_by(CameraStation.code)).all()
    members = db.scalars(select(ProjectMember)).all()
    users = {row.id: row for row in db.scalars(select(User)).all()}

    det_by_project = dict(db.execute(select(Detection.project_id, func.count()).group_by(Detection.project_id)).all())
    ind_by_project = dict(db.execute(select(Individual.project_id, func.count()).group_by(Individual.project_id)).all())
    stn_by_project = dict(db.execute(select(CameraStation.project_id, func.count()).group_by(CameraStation.project_id)).all())
    det_by_station = dict(
        db.execute(select(Detection.station_id, func.count()).where(Detection.station_id.is_not(None)).group_by(Detection.station_id)).all()
    )
    members_by_project: dict[str, list[dict]] = defaultdict(list)
    for member in members:
        person = users.get(member.user_id)
        members_by_project[member.project_id].append(
            {
                "user_id": member.user_id,
                "display_name": person.display_name if person else None,
                "email": person.email if person else None,
                "role": member.role,
            }
        )
    org_map = {row.id: row for row in orgs}
    home_owner: dict[str, User] = {}
    for person in users.values():
        home = getattr(person, "home_project_id", None)
        if home and home not in home_owner:
            home_owner[home] = person

    def creator_for(project: Project) -> User | None:
        created_by = getattr(project, "created_by_id", None)
        if created_by and created_by in users:
            return users[created_by]
        if project.id in home_owner:
            return home_owner[project.id]
        members = members_by_project.get(project.id) or []
        if members:
            return users.get(members[0]["user_id"])
        return None

    dirty = False
    for project in projects:
        if getattr(project, "created_by_id", None):
            continue
        inferred = creator_for(project)
        if inferred:
            project.created_by_id = inferred.id
            dirty = True
    if dirty:
        db.commit()

    project_rows = []
    creators_map: dict[str, dict] = {}
    for project in projects:
        creator = creator_for(project)
        if creator:
            creators_map[creator.id] = {
                "id": creator.id,
                "display_name": creator.display_name,
                "email": creator.email,
            }
        project_rows.append(
            {
                "id": project.id,
                "name": project.name,
                "slug": project.slug,
                "region": project.region,
                "active": project.active,
                "created_at": _iso(project.created_at),
                "organization_id": project.organization_id,
                "organization_name": org_map[project.organization_id].name if project.organization_id in org_map else None,
                "created_by_id": creator.id if creator else None,
                "created_by_name": creator.display_name if creator else None,
                "created_by_email": creator.email if creator else None,
                "individual_count": int(ind_by_project.get(project.id) or 0),
                "detection_count": int(det_by_project.get(project.id) or 0),
                "station_count": int(stn_by_project.get(project.id) or 0),
                "members": members_by_project.get(project.id, []),
            }
        )

    return {
        "organizations": [
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "region": org.region,
                "created_at": _iso(org.created_at),
                "project_count": sum(1 for p in projects if p.organization_id == org.id),
            }
            for org in orgs
        ],
        "projects": project_rows,
        "stations": [
            {
                "id": station.id,
                "code": station.code,
                "name": station.name,
                "latitude": station.latitude,
                "longitude": station.longitude,
                "camera_model": station.camera_model,
                "project_id": station.project_id,
                "project_name": next((p.name for p in projects if p.id == station.project_id), None),
                "detection_count": int(det_by_station.get(station.id) or 0),
                "active_from": _iso(station.active_from),
                "active_to": _iso(station.active_to),
            }
            for station in stations
        ],
        "creators": sorted(
            creators_map.values(),
            key=lambda row: (row["display_name"] or row["email"] or "").lower(),
        ),
    }


@router.patch("/projects/{project_id}")
def patch_project(
    project_id: str,
    payload: ProjectAdminPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.active is not None:
        project.active = payload.active
    if payload.name:
        project.name = payload.name.strip()
    if payload.region is not None:
        project.region = payload.region.strip() or None
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="patch_project",
            entity="project",
            entity_id=project.id,
            detail=payload.model_dump_json(),
        )
    )
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "name": project.name,
        "slug": project.slug,
        "region": project.region,
        "active": project.active,
    }


@router.post("/projects")
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    from app.services.onboarding import slugify, unique_project_slug

    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Workspace name is required")

    org_id = payload.organization_id
    if not org_id and payload.organization_name and payload.organization_name.strip():
        org_name = payload.organization_name.strip()
        existing = db.scalar(select(Organization).where(Organization.name == org_name))
        if existing:
            org_id = existing.id
        else:
            base = slugify(org_name, fallback="org")
            taken = {row for row in db.scalars(select(Organization.slug)).all()}
            slug = base if base not in taken else f"{base}-org"
            n = 2
            while slug in taken:
                slug = f"{base}-org-{n}"
                n += 1
            org = Organization(name=org_name, slug=slug, region=payload.region)
            db.add(org)
            db.flush()
            org_id = org.id
    elif org_id and not db.get(Organization, org_id):
        raise HTTPException(status_code=404, detail="Organization not found")

    owner = db.get(User, payload.owner_user_id) if payload.owner_user_id else admin
    if not owner:
        raise HTTPException(status_code=404, detail="Owner account not found")

    project = Project(
        name=name,
        slug=unique_project_slug(db, name),
        region=(payload.region or "").strip() or None,
        active=payload.active,
        organization_id=org_id,
        created_by_id=admin.id,
    )
    db.add(project)
    db.flush()
    existing_member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == owner.id)
    )
    if not existing_member:
        db.add(ProjectMember(project_id=project.id, user_id=owner.id, role="admin"))
    if not getattr(owner, "home_project_id", None):
        owner.home_project_id = project.id
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="create_project",
            entity="project",
            entity_id=project.id,
            detail=f"{project.name} · owner {owner.email}",
        )
    )
    db.commit()
    db.refresh(project)
    org = db.get(Organization, project.organization_id) if project.organization_id else None
    return {
        "id": project.id,
        "name": project.name,
        "slug": project.slug,
        "region": project.region,
        "active": project.active,
        "organization_id": project.organization_id,
        "organization_name": org.name if org else None,
        "created_by_id": project.created_by_id,
        "owner_user_id": owner.id,
    }


@router.post("/projects/{project_id}/members")
def add_project_member(
    project_id: str,
    payload: MemberCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Workspace not found")
    person = db.get(User, payload.user_id)
    if not person:
        raise HTTPException(status_code=404, detail="Account not found")
    role = (payload.member_role or "researcher").strip() or "researcher"
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == person.id)
    )
    if member:
        member.role = role
    else:
        member = ProjectMember(project_id=project_id, user_id=person.id, role=role)
        db.add(member)
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="add_project_member",
            entity="project",
            entity_id=project_id,
            detail=f"{person.email} · {role}",
        )
    )
    db.commit()
    return {
        "project_id": project_id,
        "user_id": person.id,
        "display_name": person.display_name,
        "email": person.email,
        "member_role": role,
    }


@router.delete("/projects/{project_id}/members/{user_id}")
def remove_project_member(
    project_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    )
    if not member:
        raise HTTPException(status_code=404, detail="Membership not found")
    person = db.get(User, user_id)
    if person and getattr(person, "home_project_id", None) == project_id:
        person.home_project_id = None
    db.delete(member)
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="remove_project_member",
            entity="project",
            entity_id=project_id,
            detail=person.email if person else user_id,
        )
    )
    db.commit()
    return {"status": "removed", "project_id": project_id, "user_id": user_id}


@router.patch("/people/{user_id}/home-project")
def set_home_project(
    user_id: str,
    payload: HomeProjectPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    person = db.get(User, user_id)
    if not person:
        raise HTTPException(status_code=404, detail="Account not found")
    project_id = payload.project_id
    if project_id:
        project = db.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Workspace not found")
        member = db.scalar(
            select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        )
        if not member:
            db.add(ProjectMember(project_id=project_id, user_id=user_id, role="researcher"))
        person.home_project_id = project_id
    else:
        person.home_project_id = None
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="set_home_project",
            entity="user",
            entity_id=user_id,
            detail=project_id or "cleared",
        )
    )
    db.commit()
    return {"user_id": user_id, "home_project_id": person.home_project_id}


@router.get("/catalog")
def catalog(
    q: str | None = None,
    grade: str | None = None,
    review_state: str | None = None,
    project_id: str | None = None,
    limit: int = Query(80, ge=1, le=250),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    det_stmt = select(Detection).order_by(Detection.created_at.desc())
    if grade:
        det_stmt = det_stmt.where(Detection.grade == grade)
    if review_state:
        det_stmt = det_stmt.where(Detection.review_state == review_state)
    if project_id:
        det_stmt = det_stmt.where(Detection.project_id == project_id)
    detections = db.scalars(det_stmt.limit(limit)).all()

    ind_stmt = select(Individual).order_by(Individual.created_at.desc())
    if project_id:
        ind_stmt = ind_stmt.where(Individual.project_id == project_id)
    individuals = db.scalars(ind_stmt.limit(limit)).all()

    claim_stmt = select(NamingClaim).order_by(NamingClaim.created_at.desc())
    if project_id:
        claim_stmt = (
            claim_stmt.join(Individual, NamingClaim.individual_id == Individual.id).where(
                Individual.project_id == project_id
            )
        )
    claims = db.scalars(claim_stmt.limit(limit)).all()
    users = {row.id: row for row in db.scalars(select(User)).all()}
    projects = {row.id: row for row in db.scalars(select(Project)).all()}
    stations = {row.id: row for row in db.scalars(select(CameraStation)).all()}
    ind_map = {row.id: row for row in db.scalars(select(Individual)).all()}

    needle = (q or "").strip().lower()

    def hit(*parts: str | None) -> bool:
        if not needle:
            return True
        blob = " ".join(p or "" for p in parts).lower()
        return needle in blob

    det_rows = []
    for det in detections:
        individual = ind_map.get(det.individual_id or "")
        suggested = ind_map.get(det.suggested_individual_id or "")
        uploader = users.get(det.uploader_id)
        station = stations.get(det.station_id or "")
        project = projects.get(det.project_id)
        if not hit(
            det.species,
            det.grade,
            det.review_state,
            project.name if project else None,
            station.code if station else None,
            individual.code if individual else None,
            individual.name if individual else None,
            uploader.display_name if uploader else None,
        ):
            continue
        det_rows.append(
            {
                "id": det.id,
                "created_at": _iso(det.created_at),
                "captured_at": _iso(det.captured_at),
                "species": det.species,
                "side": det.side,
                "grade": det.grade,
                "review_state": det.review_state,
                "confidence": det.confidence,
                "match_score": det.match_score,
                "engine": det.recognition_engine,
                "model_version": det.recognition_model_version,
                "project_id": det.project_id,
                "project_name": project.name if project else None,
                "station_code": station.code if station else None,
                "individual_code": individual.code if individual else None,
                "individual_name": individual.name if individual else None,
                "suggested_code": suggested.code if suggested else None,
                "uploader_name": uploader.display_name if uploader else None,
                "reviewer_name": users[det.reviewer_id].display_name if det.reviewer_id in users else None,
                "second_reviewer_name": users[det.second_reviewer_id].display_name if det.second_reviewer_id in users else None,
            }
        )

    ind_rows = []
    for row in individuals:
        project = projects.get(row.project_id)
        if not hit(row.id, row.code, row.name, row.species, row.identity_status, project.name if project else None):
            continue
        ind_rows.append(
            {
                "id": row.id,
                "code": row.code,
                "name": row.name,
                "species": row.species,
                "sex": row.sex,
                "life_status": row.life_status,
                "identity_status": row.identity_status,
                "share_public": row.share_public,
                "created_at": _iso(row.created_at),
                "project_id": row.project_id,
                "project_name": project.name if project else None,
            }
        )

    claim_rows = []
    for claim in claims:
        individual = ind_map.get(claim.individual_id)
        if project_id and individual and individual.project_id != project_id:
            continue
        if project_id and not individual:
            continue
        proposer = users.get(claim.proposer_id)
        if not hit(claim.proposed_name, claim.status, individual.code if individual else None, proposer.display_name if proposer else None):
            continue
        claim_rows.append(
            {
                "id": claim.id,
                "proposed_name": claim.proposed_name,
                "status": claim.status,
                "created_at": _iso(claim.created_at),
                "decided_at": _iso(claim.decided_at),
                "individual_code": individual.code if individual else None,
                "individual_name": individual.name if individual else None,
                "proposer_name": proposer.display_name if proposer else None,
                "approver_name": users[claim.approver_id].display_name if claim.approver_id in users else None,
                "project_id": individual.project_id if individual else None,
            }
        )

    return {"detections": det_rows, "individuals": ind_rows, "claims": claim_rows}


@router.get("/workspaces/{project_id}")
def workspace_detail(
    project_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Workspace not found")

    org = db.get(Organization, project.organization_id) if project.organization_id else None
    creator = db.get(User, project.created_by_id) if getattr(project, "created_by_id", None) else None
    if creator is None:
        home_user = db.scalar(select(User).where(User.home_project_id == project_id).limit(1))
        creator = home_user
    members = db.scalars(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    users = {row.id: row for row in db.scalars(select(User)).all()}
    stations = db.scalars(select(CameraStation).where(CameraStation.project_id == project_id).order_by(CameraStation.code)).all()
    individuals = db.scalars(
        select(Individual).where(Individual.project_id == project_id).order_by(Individual.created_at.desc()).limit(80)
    ).all()
    detections = db.scalars(
        select(Detection).where(Detection.project_id == project_id).order_by(Detection.created_at.desc()).limit(80)
    ).all()
    stations_map = {row.id: row for row in stations}
    ind_map = {row.id: row for row in db.scalars(select(Individual).where(Individual.project_id == project_id)).all()}

    grade_counts = dict(
        db.execute(
            select(Detection.grade, func.count()).where(Detection.project_id == project_id).group_by(Detection.grade)
        ).all()
    )
    review_counts = dict(
        db.execute(
            select(Detection.review_state, func.count())
            .where(Detection.project_id == project_id, Detection.review_state.is_not(None))
            .group_by(Detection.review_state)
        ).all()
    )
    identity_counts = dict(
        db.execute(
            select(Individual.identity_status, func.count())
            .where(Individual.project_id == project_id)
            .group_by(Individual.identity_status)
        ).all()
    )

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "slug": project.slug,
            "region": project.region,
            "active": project.active,
            "created_at": _iso(project.created_at),
            "organization_id": project.organization_id,
            "organization_name": org.name if org else None,
            "created_by_id": creator.id if creator else None,
            "created_by_name": creator.display_name if creator else None,
            "created_by_email": creator.email if creator else None,
        },
        "totals": {
            "members": len(members),
            "stations": len(stations),
            "individuals": _count(db, Individual, Individual.project_id == project_id),
            "detections": _count(db, Detection, Detection.project_id == project_id),
            "needs_identification": _count(
                db, Detection, Detection.project_id == project_id, Detection.grade == "needs_id"
            ),
            "awaiting_second_review": _count(
                db, Detection, Detection.project_id == project_id, Detection.review_state == "awaiting_second_review"
            ),
            "pending_names": _count(
                db,
                NamingClaim,
                NamingClaim.status == "pending",
                NamingClaim.individual_id.in_(select(Individual.id).where(Individual.project_id == project_id)),
            ),
        },
        "breakdowns": {
            "grades": grade_counts,
            "review_states": review_counts,
            "identity": identity_counts,
        },
        "members": [
            {
                "user_id": member.user_id,
                "display_name": users[member.user_id].display_name if member.user_id in users else None,
                "email": users[member.user_id].email if member.user_id in users else None,
                "role": users[member.user_id].role if member.user_id in users else None,
                "member_role": member.role,
                "verified": users[member.user_id].verified if member.user_id in users else None,
            }
            for member in members
        ],
        "stations": [
            {
                "id": station.id,
                "code": station.code,
                "name": station.name,
                "latitude": station.latitude,
                "longitude": station.longitude,
                "camera_model": station.camera_model,
                "detection_count": _count(db, Detection, Detection.station_id == station.id),
            }
            for station in stations
        ],
        "individuals": [
            {
                "id": row.id,
                "code": row.code,
                "name": row.name,
                "species": row.species,
                "identity_status": row.identity_status,
                "sex": row.sex,
                "life_status": row.life_status,
                "created_at": _iso(row.created_at),
            }
            for row in individuals
        ],
        "detections": [
            {
                "id": det.id,
                "created_at": _iso(det.created_at),
                "captured_at": _iso(det.captured_at),
                "species": det.species,
                "grade": det.grade,
                "review_state": det.review_state,
                "side": det.side,
                "station_code": stations_map[det.station_id].code if det.station_id in stations_map else None,
                "individual_code": ind_map[det.individual_id].code if det.individual_id in ind_map else None,
                "individual_name": ind_map[det.individual_id].name if det.individual_id in ind_map else None,
                "uploader_name": users[det.uploader_id].display_name if det.uploader_id in users else None,
            }
            for det in detections
        ],
    }


@router.get("/species")
def species(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> list[dict]:
    rows = db.scalars(select(SpeciesProfile).order_by(SpeciesProfile.sort_order, SpeciesProfile.common_name)).all()
    counts = dict(db.execute(select(Individual.species, func.count()).group_by(Individual.species)).all())
    det_counts = dict(db.execute(select(Detection.species, func.count()).group_by(Detection.species)).all())
    return [
        {
            "id": row.id,
            "slug": row.slug,
            "common_name": row.common_name,
            "scientific_name": row.scientific_name,
            "id_prefix": row.id_prefix,
            "pattern_bearing": row.pattern_bearing,
            "flank_required": row.flank_required,
            "deployed": row.deployed,
            "sort_order": row.sort_order,
            "individual_count": int(counts.get(row.slug) or 0),
            "detection_count": int(det_counts.get(row.slug) or 0),
        }
        for row in rows
    ]


@router.patch("/species/{species_id}")
def patch_species(
    species_id: str,
    payload: SpeciesAdminPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    row = db.get(SpeciesProfile, species_id)
    if not row:
        raise HTTPException(status_code=404, detail="Species profile not found")
    if payload.deployed is not None:
        row.deployed = payload.deployed
    if payload.flank_required is not None:
        row.flank_required = payload.flank_required
    if payload.common_name:
        row.common_name = payload.common_name.strip()
    if payload.scientific_name is not None:
        row.scientific_name = payload.scientific_name.strip() or None
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="patch_species",
            entity="species_profile",
            entity_id=row.id,
            detail=payload.model_dump_json(),
        )
    )
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "slug": row.slug,
        "common_name": row.common_name,
        "scientific_name": row.scientific_name,
        "deployed": row.deployed,
        "flank_required": row.flank_required,
        "pattern_bearing": row.pattern_bearing,
        "id_prefix": row.id_prefix,
    }


def _audit_href(
    entity: str | None,
    entity_id: str | None,
    *,
    individual_code: str | None = None,
    user_query: str | None = None,
) -> str | None:
    if not entity or not entity_id:
        return None
    if entity == "detection":
        return f"/observations/{entity_id}"
    if entity == "individual":
        if individual_code:
            return f"/individuals/{individual_code}"
        return f"/admin/catalog?tab=individuals&q={entity_id}"
    if entity == "naming_claim":
        return "/admin/names"
    if entity == "project":
        return f"/admin/workspaces/{entity_id}"
    if entity == "user":
        q = user_query or entity_id
        return f"/admin/people?q={q}"
    if entity == "media":
        return f"/observations/{entity_id}"
    return None


SENSITIVE_AUDIT_ACTIONS = {
    "approve_name",
    "reject_name",
    "patch_user",
    "patch_project",
    "create_project",
    "add_project_member",
    "remove_project_member",
    "set_home_project",
    "activate_coat_model",
    "merge_individuals",
}


@router.get("/audit")
def audit_log(
    action: str | None = None,
    entity: str | None = None,
    actor_id: str | None = None,
    project_id: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    rows = list(db.scalars(stmt.order_by(AuditLog.created_at.desc())).all())
    needle = (q or "").strip().lower()
    if needle:
        rows = [
            row
            for row in rows
            if needle in " ".join([row.action, row.entity, row.entity_id, row.detail or ""]).lower()
        ]
    if project_id:
        project_hint = project_id.lower()
        project_rows = [
            row
            for row in rows
            if (row.entity == "project" and row.entity_id == project_id)
            or (row.detail and project_hint in row.detail.lower())
            or (row.entity_id == project_id)
        ]
        # Also include detection/individual events tied to the workspace when detail mentions it,
        # and expand via related detections/individuals belonging to the project.
        det_ids = {
            row.id
            for row in db.scalars(select(Detection).where(Detection.project_id == project_id)).all()
        }
        ind_ids = {
            row.id
            for row in db.scalars(select(Individual).where(Individual.project_id == project_id)).all()
        }
        member_ids = {
            row.user_id
            for row in db.scalars(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
        }
        related = [
            row
            for row in rows
            if (row.entity == "detection" and row.entity_id in det_ids)
            or (row.entity == "individual" and row.entity_id in ind_ids)
            or (row.entity == "user" and row.entity_id in member_ids)
            or (row.actor_id in member_ids and row.entity in {"detection", "individual", "naming_claim", "project"})
        ]
        seen = {row.id for row in project_rows}
        for row in related:
            if row.id not in seen:
                project_rows.append(row)
                seen.add(row.id)
        rows = project_rows
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    actor_ids = {row.actor_id for row in page_rows if row.actor_id}
    actors = {row.id: row for row in db.scalars(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}
    entity_user_ids = {row.entity_id for row in page_rows if row.entity == "user" and row.entity_id}
    entity_users = (
        {row.id: row for row in db.scalars(select(User).where(User.id.in_(entity_user_ids))).all()} if entity_user_ids else {}
    )
    entity_ind_ids = {row.entity_id for row in page_rows if row.entity == "individual" and row.entity_id}
    entity_inds = (
        {row.id: row for row in db.scalars(select(Individual).where(Individual.id.in_(entity_ind_ids))).all()}
        if entity_ind_ids
        else {}
    )
    actions = sorted({value for (value,) in db.execute(select(AuditLog.action).distinct()).all() if value})
    entities = sorted({value for (value,) in db.execute(select(AuditLog.entity).distinct()).all() if value})
    actors_list = [
        {"id": u.id, "display_name": u.display_name, "email": u.email}
        for u in db.scalars(select(User).order_by(User.display_name.asc())).all()
    ]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "actions": actions,
        "entities": entities,
        "actors": actors_list,
        "rows": [
            {
                "id": row.id,
                "action": row.action,
                "entity": row.entity,
                "entity_id": row.entity_id,
                "detail": row.detail,
                "created_at": _iso(row.created_at),
                "actor_id": row.actor_id,
                "actor_name": actors[row.actor_id].display_name if row.actor_id in actors else None,
                "actor_email": actors[row.actor_id].email if row.actor_id in actors else None,
                "sensitive": row.action in SENSITIVE_AUDIT_ACTIONS,
                "href": _audit_href(
                    row.entity,
                    row.entity_id,
                    individual_code=entity_inds[row.entity_id].code if row.entity_id in entity_inds else None,
                    user_query=(
                        entity_users[row.entity_id].email
                        if row.entity_id in entity_users
                        else None
                    ),
                ),
            }
            for row in page_rows
        ],
    }


@router.get("/recognition")
def recognition(
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    from dataclasses import asdict

    from app.config import get_settings
    from app.export_train_set import assess_readiness
    from app.services.recognition.service import get_recognition_service

    total = _count(db, MatchReview)
    rows = db.scalars(
        select(MatchReview).order_by(MatchReview.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    users = {row.id: row for row in db.scalars(select(User)).all()}
    detections = {row.id: row for row in db.scalars(select(Detection)).all()}
    individuals = {row.id: row for row in db.scalars(select(Individual)).all()}
    scored = [row.was_correct for row in db.scalars(select(MatchReview)).all() if row.was_correct is not None]
    settings = get_settings()
    service = get_recognition_service()
    readiness = assess_readiness(db)
    from app.services.recognition.train_pipeline import status as train_status

    pipe = train_status(db)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "scored": len(scored),
        "correct": sum(1 for item in scored if item),
        "incorrect": sum(1 for item in scored if item is False),
        "engine": {
            "name": service.engine.name,
            "model_version": service.engine.model_version,
            "stores_coat_embeddings": bool(getattr(service.engine, "stores_coat_embeddings", False)),
            "recognition_engine_setting": settings.recognition_engine,
            "coat_model_path": settings.coat_model_path or pipe.get("active", {}).get("coat_model_path"),
        },
        "training": asdict(readiness),
        "pipeline": pipe,
        "rows": [
            {
                "id": row.id,
                "created_at": _iso(row.created_at),
                "engine": row.engine,
                "model_version": row.model_version,
                "review_state": row.review_state,
                "similarity_score": row.similarity_score,
                "was_correct": row.was_correct,
                "detection_id": row.detection_id,
                "species": detections[row.detection_id].species if row.detection_id in detections else None,
                "suggested_code": individuals[row.suggested_individual_id].code if row.suggested_individual_id in individuals else None,
                "confirmed_code": individuals[row.confirmed_individual_id].code if row.confirmed_individual_id in individuals else None,
                "actor_name": users[row.actor_id].display_name if row.actor_id in users else None,
            }
            for row in rows
        ],
    }


class TrainRequest(BaseModel):
    force: bool = False
    epochs: int = 12
    activate: bool = True
    backfill: bool = True


@router.post("/recognition/export")
def recognition_export(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> dict:
    from app.services.recognition.train_pipeline import run_export

    try:
        return run_export(db, actor=user)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/recognition/train")
def recognition_train(
    payload: TrainRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> dict:
    from app.services.recognition.train_pipeline import run_activate, run_train

    try:
        result = run_train(db, actor=user, force=payload.force, epochs=max(1, min(payload.epochs, 40)))
        if payload.activate:
            result["activate"] = run_activate(db, actor=user, backfill=payload.backfill)
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/recognition/activate")
def recognition_activate(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> dict:
    from app.services.recognition.train_pipeline import run_activate

    try:
        return run_activate(db, actor=user, backfill=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
