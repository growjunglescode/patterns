from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user, require_roles
from app.roles import canonical_role
from app.db import get_db
from app.models import CameraStation, Detection, Follow, Individual, NamingClaim, Organization, Project, User
from app.schemas import ProjectOut, StationOut, UserAdminPatch, UserOut
from app.services import get_storage
from app.services.identity import generalize
from app.services.onboarding import resolve_user_project
from app.services.serialize import claim_out, detection_out, individual_out, user_out

router = APIRouter(prefix="/api", tags=["workspace"])


def _resolve_project(db: Session, project_id: str | None, user: User | None = None) -> Project | None:
    if project_id:
        project = db.get(Project, project_id)
        if project:
            return project
    if user is not None:
        return resolve_user_project(db, user)
    return db.scalar(select(Project).where(Project.active.is_(True)).order_by(Project.created_at.asc()).limit(1))


def _org_name(db: Session, project: Project | None) -> str | None:
    if not project or not getattr(project, "organization_id", None):
        return None
    org = db.get(Organization, project.organization_id)
    return org.name if org else None


@router.get("/overview")
def overview(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    project = _resolve_project(db, project_id, user)
    individual_count_stmt = select(func.count()).select_from(Individual)
    review_stmt = select(func.count()).select_from(Detection).where(Detection.grade == "needs_id")
    recent_stmt = (
        select(Detection)
        .options(
            selectinload(Detection.media),
            selectinload(Detection.individual),
            selectinload(Detection.suggested_individual),
            selectinload(Detection.station),
            selectinload(Detection.project),
        )
        .order_by(Detection.created_at.desc())
        .limit(8)
    )
    if project:
        individual_count_stmt = individual_count_stmt.where(Individual.project_id == project.id)
        review_stmt = review_stmt.where(Detection.project_id == project.id)
        recent_stmt = recent_stmt.where(Detection.project_id == project.id)
    individuals = db.scalar(individual_count_stmt) or 0
    tracking = db.scalar(select(func.count()).select_from(Follow).where(Follow.user_id == user.id)) or 0
    pending = db.scalar(select(func.count()).select_from(NamingClaim).where(NamingClaim.status == "pending")) or 0
    review = db.scalar(review_stmt) or 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    silent = 0
    unnamed_new = 0
    ind_rows_stmt = select(Individual)
    if project:
        ind_rows_stmt = ind_rows_stmt.where(Individual.project_id == project.id)
    for row in db.scalars(ind_rows_stmt).all():
        last = db.scalar(
            select(func.max(Detection.captured_at)).where(Detection.individual_id == row.id)
        )
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last < cutoff:
                silent += 1
        if row.identity_status == "unnamed":
            created = row.created_at
            if created is not None:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - created).days <= 30:
                    unnamed_new += 1
    recent = db.scalars(recent_stmt).all()
    claims = db.scalars(
        select(NamingClaim)
        .options(selectinload(NamingClaim.individual))
        .where(NamingClaim.status == "pending")
        .order_by(NamingClaim.created_at.desc())
    ).all()
    return {
        "project_id": project.id if project else None,
        "project_name": project.name if project else "Patterns",
        "organization_name": _org_name(db, project),
        "individuals": individuals,
        "tracking": tracking,
        "names_pending": pending,
        "to_review": review,
        "silent_180": silent,
        "new_unidentified": unnamed_new,
        "recent": [detection_out(db, row, user) for row in recent],
        "pending_names": [claim_out(db, row) for row in claims],
    }


@router.get("/portfolio")
def portfolio(db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "scientist"))) -> dict:
    projects = db.scalars(select(Project)).all()
    cards = []
    series: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    detections = db.scalars(select(Detection).options(selectinload(Detection.project))).all()
    for det in detections:
        month = (det.captured_at or det.created_at).strftime("%Y-%m")
        series[det.project.name][month] += 1
    for project in projects:
        cards.append(
            ProjectOut(
                id=project.id,
                name=project.name,
                slug=project.slug,
                region=project.region,
                active=project.active,
                organization_id=getattr(project, "organization_id", None),
                organization_name=_org_name(db, project),
                individual_count=db.scalar(select(func.count()).select_from(Individual).where(Individual.project_id == project.id)) or 0,
                detection_count=db.scalar(select(func.count()).select_from(Detection).where(Detection.project_id == project.id)) or 0,
                station_count=db.scalar(select(func.count()).select_from(CameraStation).where(CameraStation.project_id == project.id)) or 0,
            )
        )
    months = sorted({m for by_project in series.values() for m in by_project})
    return {
        "projects": [c.model_dump() for c in cards],
        "totals": {
            "projects": len(projects),
            "active": sum(1 for p in projects if p.active),
            "individuals": db.scalar(select(func.count()).select_from(Individual)) or 0,
            "detections": len(detections),
            "stations": db.scalar(select(func.count()).select_from(CameraStation)) or 0,
        },
        "months": months,
        "series": {name: [series[name].get(month, 0) for month in months] for name in series},
    }


@router.get("/analytics")
def analytics(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    ind_stmt = select(Individual)
    det_stmt = select(Detection).options(selectinload(Detection.station))
    if project_id:
        ind_stmt = ind_stmt.where(Individual.project_id == project_id)
        det_stmt = det_stmt.where(Detection.project_id == project_id)
    individuals = db.scalars(ind_stmt).all()
    detections = db.scalars(det_stmt).all()
    named = sum(1 for i in individuals if i.identity_status == "named")
    recapture = 0
    counts: dict[str, int] = defaultdict(int)
    for det in detections:
        if det.individual_id:
            counts[det.individual_id] += 1
    recapture = sum(1 for n in counts.values() if n > 1)
    recapture_rate = round(100 * recapture / max(len(counts), 1))
    species = defaultdict(int)
    sexes = defaultdict(int)
    grades = defaultdict(int)
    hours = [0] * 24
    for ind in individuals:
        species[ind.species] += 1
        sexes[ind.sex or "unknown"] += 1
    for det in detections:
        grades[det.grade] += 1
        ts = det.captured_at or det.created_at
        hours[ts.hour] += 1
    stations = defaultdict(int)
    for det in detections:
        if det.station:
            stations[det.station.code] += 1
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
    top_rows = []
    for iid, n in top:
        ind = db.get(Individual, iid)
        if ind:
            out = individual_out(db, ind)
            top_rows.append({**out.model_dump(), "detections": n})
    return {
        "individuals": len(individuals),
        "detections": len(detections),
        "recapture_rate": recapture_rate,
        "stations": db.scalar(select(func.count()).select_from(CameraStation)) or 0,
        "named": named,
        "unnamed": len(individuals) - named,
        "species": dict(species),
        "sexes": dict(sexes),
        "grades": dict(grades),
        "hours": hours,
        "station_performance": dict(stations),
        "top_individuals": top_rows,
    }


@router.get("/map")
def map_data(
    mode: str = "sightings",
    individual_id: str | None = None,
    uploader_id: str | None = None,
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if mode == "stations":
        stmt = select(CameraStation)
        if project_id:
            stmt = stmt.where(CameraStation.project_id == project_id)
        stations = db.scalars(stmt).all()
        return {
            "mode": "stations",
            "points": [
                {"id": s.id, "label": s.code, "lat": s.latitude, "lng": s.longitude, "kind": "station"}
                for s in stations
            ],
        }
    det_stmt = select(Detection).options(
        selectinload(Detection.individual),
        selectinload(Detection.station),
        selectinload(Detection.media),
    )
    if project_id:
        det_stmt = det_stmt.where(Detection.project_id == project_id)
    detections = db.scalars(det_stmt).all()
    if individual_id:
        detections = [det for det in detections if det.individual_id == individual_id]
    if uploader_id and canonical_role(user.role) == "admin":
        detections = [det for det in detections if det.uploader_id == uploader_id]
    storage = get_storage()
    points = []
    track = []
    for det in detections:
        own = det.uploader_id == user.id or canonical_role(user.role) == "admin"
        lat, lon = generalize(det.latitude, det.longitude, user.role, own)
        if lat is None:
            continue
        uploader = db.get(User, det.uploader_id) if det.uploader_id else None
        if det.individual:
            label = det.individual.name or det.individual.code
        else:
            label = "Unassigned jaguar"
        when = det.captured_at or det.created_at
        photo = next((m for m in (det.media or []) if m.kind in {"photo", "frame"}), None)
        location = det.station.name if det.station and det.station.name else (det.station.code if det.station else None)
        point = {
            "id": det.id,
            "label": label,
            "lat": lat,
            "lng": lon,
            "kind": "sighting",
            "species": det.species,
            "grade": det.grade,
            "individual_id": det.individual_id,
            "individual_code": det.individual.code if det.individual else None,
            "station_code": det.station.code if det.station else None,
            "location": location,
            "photo_url": storage.public_url(photo.storage_key) if photo else None,
            "uploader_id": det.uploader_id,
            "uploader_name": uploader.display_name if uploader else None,
            "captured_at": when.isoformat() if when else None,
        }
        points.append(point)
        track.append(point)
    track.sort(key=lambda item: item["captured_at"] or "")
    return {"mode": "sightings", "points": points, "track": track}


@router.get("/stations", response_model=list[StationOut])
def stations(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[StationOut]:
    if not project_id:
        home = resolve_user_project(db, user)
        if home:
            project_id = home.id
    stmt = select(CameraStation)
    if project_id:
        stmt = stmt.where(CameraStation.project_id == project_id)
    rows = db.scalars(stmt).all()
    out = []
    for station in rows:
        n = db.scalar(select(func.count()).select_from(Detection).where(Detection.station_id == station.id)) or 0
        out.append(
            StationOut(
                id=station.id,
                code=station.code,
                name=station.name,
                latitude=station.latitude,
                longitude=station.longitude,
                camera_model=station.camera_model,
                project_id=station.project_id,
                detection_count=n,
            )
        )
    return out


@router.get("/projects/{project_id}/data")
def project_data(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> list[dict]:
    rows = db.scalars(
        select(Detection)
        .options(selectinload(Detection.individual), selectinload(Detection.station), selectinload(Detection.project))
        .where(Detection.project_id == project_id)
        .order_by(Detection.captured_at.is_(None), Detection.captured_at.desc())
    ).all()
    table = []
    for det in rows:
        uploader = db.get(User, det.uploader_id) if det.uploader_id else None
        table.append(
            {
                "id": det.id,
                "individual": det.individual.name or det.individual.code if det.individual else "—",
                "station": det.station.code if det.station else "—",
                "date": (det.captured_at or det.created_at).date().isoformat(),
                "side": det.side,
                "sex": det.individual.sex if det.individual else "—",
                "confidence": det.confidence,
                "grade": det.grade,
                "uploader_id": det.uploader_id,
                "uploader": uploader.display_name if uploader else "—",
            }
        )
    return table


@router.get("/projects/{project_id}/capture-matrix")
def capture_matrix(
    project_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    detections = db.scalars(
        select(Detection)
        .options(selectinload(Detection.individual))
        .where(Detection.project_id == project_id, Detection.individual_id.is_not(None))
    ).all()
    occasions: set[str] = set()
    grid: dict[str, set[str]] = defaultdict(set)
    labels: dict[str, str] = {}
    for det in detections:
        occ = (det.captured_at or det.created_at).strftime("%Y-%m")
        occasions.add(occ)
        labels[det.individual_id] = det.individual.name or det.individual.code
        grid[det.individual_id].add(occ)
    occ_list = sorted(occasions)
    matrix = [
        {"individual": labels[iid], "occasions": [month in seen for month in occ_list]}
        for iid, seen in grid.items()
    ]
    return {"occasions": occ_list, "rows": matrix}


@router.get("/users", response_model=list[UserOut])
def users(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> list[UserOut]:
    counts = dict(
        db.execute(select(Detection.uploader_id, func.count()).group_by(Detection.uploader_id)).all()
    )
    return [
        user_out(row, int(counts.get(row.id) or 0))
        for row in db.scalars(select(User).order_by(User.display_name)).all()
    ]


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: UserAdminPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> UserOut:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Account not found")
    if payload.role:
        if payload.role not in {"admin", "scientist", "citizen", "viewer"}:
            raise HTTPException(status_code=400, detail="Unknown role")
        if canonical_role(target.role) == "admin" and payload.role != "admin":
            admin_count = db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Keep at least one admin")
        target.role = payload.role
        if payload.role == "scientist":
            target.verified = True if payload.verified is None else payload.verified
        if payload.role == "admin":
            target.verified = True
    if payload.verified is not None:
        target.verified = payload.verified
    if payload.display_name:
        target.display_name = payload.display_name.strip()
    if payload.profile_public is not None:
        target.profile_public = payload.profile_public
    db.commit()
    count = db.scalar(select(func.count()).select_from(Detection).where(Detection.uploader_id == target.id)) or 0
    return user_out(target, int(count))
