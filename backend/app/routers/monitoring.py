"""Monitoring layer endpoints: individual field details, movement, dashboard, exports."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user, require_roles
from app.db import get_db
from app.models import CameraStation, Detection, Individual, Media, Project, User
from app.roles import canonical_role
from app.schemas import IndividualDetailsPatch, IndividualOut, MovementLegOut
from app.services.exports import (
    capture_matrix_csv,
    load_sightings,
    sightings_csv,
    sightings_geojson,
)
from app.services.identity import audit, display_label
from app.services.monitoring import (
    DISCOVERY_CURVE_NOTE,
    MOVEMENT_CAVEAT,
    confirmed_sightings,
    discovery_curve,
    leg_sentence,
    monitoring_map,
    movement_legs,
    movement_summary,
)
from app.services.serialize import individual_out

router = APIRouter(prefix="/api", tags=["monitoring"])

AGE_CLASSES = {"cub", "juvenile", "subadult", "adult", "unknown"}
SEXES = {"F", "M", "unknown"}
LIFE_STATUSES = {"unknown", "alive", "dead", "lost"}

NOT_SEEN_ALERT_DAYS = 180
NEW_INDIVIDUAL_ALERT_DAYS = 30


def _resolve_individual(db: Session, key: str) -> Individual:
    individual = db.scalar(
        select(Individual).options(selectinload(Individual.project)).where(Individual.id == key)
    )
    if not individual:
        individual = db.scalar(
            select(Individual).options(selectinload(Individual.project)).where(Individual.code == key)
        )
    if not individual:
        raise HTTPException(status_code=404, detail="Individual not found")
    return individual


@router.get("/individuals/{key}/movement")
def individual_movement(
    key: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Leg-by-leg minimum distances between an individual's confirmed sightings."""
    individual = _resolve_individual(db, key)
    rows = confirmed_sightings(db, individual.id)
    label = display_label(individual)
    legs = [
        MovementLegOut(**leg, sentence=leg_sentence(label, leg)).model_dump()
        for leg in movement_legs(rows)
    ]
    return {
        "individual_id": individual.id,
        "individual_code": individual.code,
        "display_name": label,
        "summary": movement_summary(rows),
        "legs": legs,
        "caveat": MOVEMENT_CAVEAT,
    }


@router.patch("/individuals/{key}/details", response_model=IndividualOut)
def patch_individual_details(
    key: str,
    payload: IndividualDetailsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IndividualOut:
    """Correct sex, life status, age class, birth year and physical notes.

    Restricted to admins and scientists; every change lands in the audit log.
    """
    if canonical_role(user.role) not in {"admin", "scientist"}:
        raise HTTPException(
            status_code=403,
            detail="Only scientists and admins can edit individual details",
        )
    individual = _resolve_individual(db, key)
    fields = payload.model_dump(exclude_unset=True)
    changes: dict[str, dict] = {}

    if "sex" in fields:
        value = (fields["sex"] or "").strip() or None
        if value is not None and value not in SEXES:
            raise HTTPException(status_code=400, detail="Sex must be F, M or unknown")
        value = None if value == "unknown" else value
        if value != individual.sex:
            changes["sex"] = {"from": individual.sex, "to": value}
            individual.sex = value

    if "life_status" in fields:
        value = (fields["life_status"] or "").strip() or "unknown"
        if value not in LIFE_STATUSES:
            raise HTTPException(
                status_code=400, detail="Life status must be unknown, alive, dead or lost"
            )
        if value != individual.life_status:
            changes["life_status"] = {"from": individual.life_status, "to": value}
            individual.life_status = value

    if "age_class" in fields:
        value = (fields["age_class"] or "").strip().lower() or None
        if value is not None and value not in AGE_CLASSES:
            raise HTTPException(
                status_code=400,
                detail="Age class must be cub, juvenile, subadult, adult or unknown",
            )
        if value != individual.age_class:
            changes["age_class"] = {"from": individual.age_class, "to": value}
            individual.age_class = value

    if "birth_year_estimate" in fields:
        value = fields["birth_year_estimate"]
        if value is not None:
            this_year = datetime.now(timezone.utc).year
            if value < 1970 or value > this_year:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estimated birth year must be between 1970 and {this_year}",
                )
        if value != individual.birth_year_estimate:
            changes["birth_year_estimate"] = {
                "from": individual.birth_year_estimate,
                "to": value,
            }
            individual.birth_year_estimate = value

    if "physical_notes" in fields:
        value = (fields["physical_notes"] or "").strip() or None
        if value != individual.physical_notes:
            changes["physical_notes"] = {"from": individual.physical_notes, "to": value}
            individual.physical_notes = value

    if changes:
        individual.details_updated_by_id = user.id
        individual.details_updated_at = datetime.now(timezone.utc)
        audit(
            db,
            user,
            "edit_individual_details",
            "individual",
            individual.id,
            json.dumps(changes, default=str),
        )
    db.commit()
    db.refresh(individual)
    return individual_out(db, individual)


@router.get("/dashboard")
def dashboard(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    """Institutional summary. Every number is counted from the database.

    Deliberately excludes any estimated total population: that needs spatial
    capture-recapture modelling and is out of scope for this layer.
    """
    now = datetime.now(timezone.utc)
    project = None
    if project_id:
        project = db.get(Project, project_id)
    if not project:
        from app.services.onboarding import resolve_user_project

        project = resolve_user_project(db, user)

    ind_stmt = select(Individual).options(selectinload(Individual.project))
    if project:
        ind_stmt = ind_stmt.where(Individual.project_id == project.id)
    individuals = db.scalars(ind_stmt).all()
    stats = monitoring_map(db, [row.id for row in individuals], now=now)

    if project:
        total_detections = db.scalar(select(func.count()).select_from(Detection).where(Detection.project_id == project.id)) or 0
        total_images = (
            db.scalar(
                select(func.count())
                .select_from(Media)
                .join(Detection, Media.detection_id == Detection.id)
                .where(Media.kind != "video", Detection.project_id == project.id)
            )
            or 0
        )
        total_media = (
            db.scalar(
                select(func.count())
                .select_from(Media)
                .join(Detection, Media.detection_id == Detection.id)
                .where(Detection.project_id == project.id)
            )
            or 0
        )
        reviewed = (
            db.scalar(
                select(func.count())
                .select_from(Detection)
                .where(Detection.project_id == project.id, Detection.reviewer_id.is_not(None))
            )
            or 0
        )
        station_count = (
            db.scalar(select(func.count()).select_from(CameraStation).where(CameraStation.project_id == project.id))
            or 0
        )
    else:
        total_detections = db.scalar(select(func.count()).select_from(Detection)) or 0
        total_images = (
            db.scalar(select(func.count()).select_from(Media).where(Media.kind != "video")) or 0
        )
        total_media = db.scalar(select(func.count()).select_from(Media)) or 0
        reviewed = (
            db.scalar(
                select(func.count()).select_from(Detection).where(Detection.reviewer_id.is_not(None))
            )
            or 0
        )
        station_count = db.scalar(select(func.count()).select_from(CameraStation)) or 0

    sexes = {"male": 0, "female": 0, "unknown": 0}
    for individual in individuals:
        key = {"M": "male", "F": "female"}.get((individual.sex or "").upper(), "unknown")
        sexes[key] += 1

    active_90 = sum(1 for row in individuals if stats[row.id]["active_last_90_days"])
    new_this_year = sum(
        1
        for row in individuals
        if (stats[row.id]["first_seen"] or row.created_at)
        and (stats[row.id]["first_seen"] or row.created_at).year == now.year
    )

    not_seen: list[dict] = []
    for individual in individuals:
        history = stats[individual.id]
        days = history["days_since_seen"]
        if days is not None and days > NOT_SEEN_ALERT_DAYS:
            not_seen.append(
                {
                    "individual_id": individual.id,
                    "code": individual.code,
                    "display_name": display_label(individual),
                    "last_seen": history["last_seen"],
                    "days_since_seen": days,
                }
            )
    not_seen.sort(key=lambda item: item["days_since_seen"], reverse=True)

    new_unidentified: list[dict] = []
    for individual in individuals:
        created = individual.created_at
        if created is None:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_days = (now - created).days
        if individual.identity_status == "unnamed" and age_days <= NEW_INDIVIDUAL_ALERT_DAYS:
            new_unidentified.append(
                {
                    "individual_id": individual.id,
                    "code": individual.code,
                    "species": individual.species,
                    "first_seen": stats[individual.id]["first_seen"],
                    "sighting_count": stats[individual.id]["sighting_count"],
                    "days_in_catalogue": age_days,
                }
            )
    new_unidentified.sort(key=lambda item: item["days_in_catalogue"])

    awaiting_id = (
        db.scalar(
            select(func.count())
            .select_from(Detection)
            .where(
                Detection.individual_id.is_(None),
                Detection.grade == "needs_id",
                *( [Detection.project_id == project.id] if project else [] ),
            )
        )
        or 0
    )

    movement_rows = []
    for individual in individuals:
        summary = stats[individual.id]["movement"]
        if stats[individual.id]["sighting_count"] == 0:
            continue
        movement_rows.append(
            {
                "individual_id": individual.id,
                "code": individual.code,
                "display_name": display_label(individual),
                "distance_last_30_days_km": summary["distance_last_30_days_km"],
                "total_min_distance_km": summary["total_min_distance_km"],
                "max_span_km": summary["max_span_km"],
                "sighting_count": stats[individual.id]["sighting_count"],
                "distinct_cameras": summary["distinct_cameras"],
                "last_seen": stats[individual.id]["last_seen"],
            }
        )
    movement_rows.sort(
        key=lambda row: (row["distance_last_30_days_km"], row["total_min_distance_km"]),
        reverse=True,
    )

    return {
        "generated_at": now,
        "project_id": project.id if project else None,
        "project_name": project.name if project else "Patterns",
        "totals": {
            "known_individuals": len(individuals),
            "active_last_90_days": active_90,
            "new_individuals_this_year": new_this_year,
            "total_images": total_images,
            "total_media_files": total_media,
            "total_detections": total_detections,
            "human_reviewed": reviewed,
            "human_reviewed_percent": (
                round(100 * reviewed / total_detections, 1) if total_detections else None
            ),
            "stations": station_count,
        },
        "sex_breakdown": sexes,
        "alerts": {
            "not_seen_days": NOT_SEEN_ALERT_DAYS,
            "not_seen": not_seen,
            "new_individual_days": NEW_INDIVIDUAL_ALERT_DAYS,
            "new_unidentified": new_unidentified,
            "detections_awaiting_id": awaiting_id,
        },
        "movement": {
            "rows": movement_rows,
            "caveat": MOVEMENT_CAVEAT,
        },
        "catalogued_over_time": discovery_curve(list(individuals), stats),
        "notes": {
            "discovery_curve": DISCOVERY_CURVE_NOTE,
            "population_estimate": (
                "Not available. An estimated total population requires spatial "
                "capture-recapture analysis and is not calculated here."
            ),
            "seeded_attributes": (
                "Sex and life status on demo records were assigned by the seed script. "
                "Treat them as unverified until a scientist confirms them."
            ),
        },
    }


def _csv_response(body: str, filename: str) -> Response:
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/sightings.csv")
def export_sightings_csv(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> Response:
    detections = load_sightings(db, project_id)
    return _csv_response(sightings_csv(db, detections, user), "patterns-sightings.csv")


@router.get("/exports/capture-matrix.csv")
def export_capture_matrix_csv(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> Response:
    if not project_id:
        from app.services.onboarding import resolve_user_project

        project = resolve_user_project(db, user) or db.scalar(select(Project).limit(1))
        if not project:
            raise HTTPException(status_code=404, detail="No project available")
        project_id = project.id
    return _csv_response(
        capture_matrix_csv(db, project_id), "patterns-capture-matrix.csv"
    )


@router.get("/exports/sightings.geojson")
def export_sightings_geojson(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> Response:
    detections = load_sightings(db, project_id)
    body = sightings_geojson(db, detections, user)
    return Response(
        content=json.dumps(body, default=str),
        media_type="application/geo+json",
        headers={"Content-Disposition": 'attachment; filename="patterns-sightings.geojson"'},
    )
