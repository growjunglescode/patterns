"""Ingest bootstrap jaguar fixtures as reviewable detections.

Creates observations in the configured database (local or Azure via DATABASE_URL)
so they appear in Upload history / Observations / Review queues.

Usage (from backend/):

    python -m app.ingest_fixtures
    python -m app.ingest_fixtures --email you@example.com
    python -m app.ingest_fixtures --dir fixtures/jaguars --dry-run

Requires an existing user (register in the app first). Uses that user as uploader.
The first admin/scientist found is used when --email is omitted.
"""

from __future__ import annotations

import argparse
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.models import CameraStation, Detection, Media, Project, ProjectMember, User
from app.services import get_storage
from app.services.identity import audit, grade_detection
from app.services.onboarding import unique_project_slug
from app.services.recognition import REVIEW_POTENTIAL, get_recognition_service
from app.services.species import normalize_side

logger = logging.getLogger(__name__)

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "jaguars"
PROJECT_NAME = "Fixture gallery"
# Costa Rica centroid-ish placeholders when a station has no GPS.
DEFAULT_LAT = 9.63
DEFAULT_LON = -84.0


def _parse_captured(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _station_code(hint: str | None, provisional_id: str) -> str:
    if not hint:
        return provisional_id.replace("BOOT-", "FIX")[:12]
    # e.g. "ENCANTO / ULA – COSTA RICA" -> ENCANTO
    head = hint.split("/")[0].strip()
    code = "".join(ch for ch in head.upper() if ch.isalnum())[:12]
    return code or provisional_id.replace("BOOT-", "FIX")[:12]


def _load_catalog(directory: Path) -> list[dict]:
    labels_path = directory / "labels.json"
    if labels_path.exists():
        payload = json.loads(labels_path.read_text(encoding="utf-8"))
        photos = payload.get("photos") or []
        by_file = {row["file"]: row for row in photos if row.get("file")}
        rows = []
        for path in sorted(directory.glob("*.jpg")):
            meta = by_file.get(path.name, {})
            rows.append({"path": path, **meta, "file": path.name})
        return rows
    return [{"path": path, "file": path.name, "provisional_id": path.stem} for path in sorted(directory.glob("*.jpg"))]


def _pick_user(db: Session, email: str | None) -> User:
    if email:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if not user:
            raise SystemExit(f"No user with email {email}. Register in the app first.")
        return user
    user = db.scalar(
        select(User)
        .where(User.role.in_(("admin", "scientist")))
        .order_by(User.created_at.asc())
        .limit(1)
    )
    if user:
        return user
    user = db.scalar(select(User).order_by(User.created_at.asc()).limit(1))
    if not user:
        raise SystemExit("No users in the database. Open the app, register, finish onboarding, then re-run.")
    return user


def _ensure_project(db: Session, user: User) -> Project:
    home = getattr(user, "home_project_id", None)
    if home:
        project = db.get(Project, home)
        if project:
            return project
    member = db.scalar(select(ProjectMember).where(ProjectMember.user_id == user.id).limit(1))
    if member:
        project = db.get(Project, member.project_id)
        if project:
            return project
    existing = db.scalar(select(Project).where(Project.name == PROJECT_NAME).limit(1))
    if existing:
        return existing
    project = Project(
        id=str(uuid.uuid4()),
        name=PROJECT_NAME,
        slug=unique_project_slug(db, PROJECT_NAME),
        region="Costa Rica",
        active=True,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role="admin"))
    if not getattr(user, "home_project_id", None):
        user.home_project_id = project.id
    return project


def _ensure_station(
    db: Session,
    project: Project,
    code: str,
    name: str,
    *,
    latitude: float | None = None,
    longitude: float | None = None,
) -> CameraStation:
    lat = float(latitude) if latitude is not None else DEFAULT_LAT
    lon = float(longitude) if longitude is not None else DEFAULT_LON
    station = db.scalar(
        select(CameraStation).where(
            CameraStation.project_id == project.id,
            CameraStation.code == code,
        )
    )
    if station:
        if latitude is not None and longitude is not None:
            station.latitude = lat
            station.longitude = lon
            if name and station.name != name:
                station.name = name
        return station
    station = CameraStation(
        id=str(uuid.uuid4()),
        project_id=project.id,
        code=code,
        name=name,
        latitude=lat,
        longitude=lon,
        camera_model="fixture-import",
    )
    db.add(station)
    db.flush()
    return station


def refresh_fixture_coords(db: Session, project: Project, rows: list[dict]) -> int:
    """Update station + detection GPS for already-ingested fixture photos."""
    updated = 0
    for row in rows:
        filename = row.get("file")
        if not filename:
            continue
        lat = row.get("latitude")
        lon = row.get("longitude")
        if lat is None or lon is None:
            continue
        media = db.scalar(
            select(Media)
            .join(Detection, Detection.id == Media.detection_id)
            .where(
                Detection.project_id == project.id,
                Media.original_filename == filename,
            )
            .limit(1)
        )
        if not media or not media.detection:
            continue
        det = media.detection
        det.latitude = float(lat)
        det.longitude = float(lon)
        code = _station_code(row.get("station_hint"), row.get("provisional_id") or filename)
        station_name = (row.get("station_hint") or f"Fixture {code}").split("/")[0].strip()
        station = _ensure_station(
            db,
            project,
            code,
            station_name,
            latitude=float(lat),
            longitude=float(lon),
        )
        det.station_id = station.id
        updated += 1
    return updated


def _already_ingested(db: Session, project_id: str, filename: str) -> bool:
    return (
        db.scalar(
            select(Media.id)
            .join(Detection, Detection.id == Media.detection_id)
            .where(
                Detection.project_id == project_id,
                Media.original_filename == filename,
            )
            .limit(1)
        )
        is not None
    )


def ingest_one(
    db: Session,
    *,
    user: User,
    project: Project,
    row: dict,
    dry_run: bool = False,
) -> dict:
    path: Path = row["path"]
    filename = row["file"]
    provisional = row.get("provisional_id") or path.stem
    flank = normalize_side(row.get("side"))
    station_hint = row.get("station_hint")
    code = _station_code(station_hint, provisional)
    station_name = (station_hint or f"Fixture {provisional}").split("/")[0].strip()
    captured = _parse_captured(row.get("captured_hint"))
    lat = float(row["latitude"]) if row.get("latitude") is not None else DEFAULT_LAT
    lon = float(row["longitude"]) if row.get("longitude") is not None else DEFAULT_LON
    notes_parts = [
        f"fixture:{provisional}",
        f"lighting:{row.get('lighting') or 'unknown'}",
    ]
    if row.get("morph"):
        notes_parts.append(f"morph:{row['morph']}")
    if row.get("notes"):
        notes_parts.append(str(row["notes"]))
    notes = " | ".join(notes_parts)

    if _already_ingested(db, project.id, filename):
        return {"file": filename, "status": "skipped", "reason": "already ingested"}

    if dry_run:
        return {
            "file": filename,
            "status": "planned",
            "station": code,
            "side": flank,
            "latitude": lat,
            "longitude": lon,
            "captured_at": captured.isoformat() if captured else None,
        }

    station = _ensure_station(db, project, code, station_name, latitude=lat, longitude=lon)
    data = path.read_bytes()
    detection_id = str(uuid.uuid4())
    key = f"{detection_id}/original{path.suffix.lower() or '.jpg'}"
    storage = get_storage()
    storage.save(key, data, "image/jpeg")

    recognition = get_recognition_service()
    analyzed = recognition.analyze(data)
    opencv_embedding = analyzed.opencv_embedding
    identity_embedding = analyzed.identity_embedding
    species = "jaguar" if analyzed.is_jaguar else (analyzed.species_label or "unknown")
    settings = get_settings()

    candidates = []
    suggested = None
    score = None
    if analyzed.is_jaguar:
        candidates = recognition.rank_candidates(
            db,
            identity_embedding=identity_embedding,
            opencv_embedding=opencv_embedding,
            species="jaguar",
            side=flank,
            project_id=project.id,
        )
        suggested = candidates[0][0] if candidates else None
        score = candidates[0][1] if candidates else None

    review_state = recognition.initial_review_state(analyzed.is_jaguar, candidates)
    detection = Detection(
        id=detection_id,
        project_id=project.id,
        station_id=station.id,
        suggested_individual_id=(
            suggested.id if suggested and score and score >= settings.suggest_threshold else None
        ),
        uploader_id=user.id,
        species=species,
        side=flank,
        captured_at=captured,
        latitude=lat,
        longitude=lon,
        confidence=analyzed.confidence,
        match_score=round(score, 4) if score is not None else None,
        summary=analyzed.summary,
        notes=notes,
        camera_make="Patterns",
        camera_model="fixture-ingest",
        metadata_source="fixture_import,station",
        review_state=review_state,
        recognition_engine=analyzed.engine,
        recognition_model_version=analyzed.model_version,
    )
    detection.grade = grade_detection(db, detection)
    db.add(detection)
    photo_media = Media(
        detection_id=detection_id,
        kind="photo",
        storage_key=key,
        content_type="image/jpeg",
        original_filename=filename,
        is_best_frame=True,
        embedding_json=json.dumps(opencv_embedding) if opencv_embedding else None,
    )
    db.add(photo_media)
    db.flush()
    recognition.store_coat_embedding(
        db,
        detection=detection,
        media=photo_media,
        embedding=identity_embedding,
    )
    if analyzed.is_jaguar:
        recognition.log_review(
            db,
            detection=detection,
            review_state=review_state or REVIEW_POTENTIAL,
            suggested_individual_id=detection.suggested_individual_id,
            confirmed_individual_id=None,
            similarity_score=score,
            candidates=candidates,
            actor=user,
            media_id=photo_media.id,
        )
    audit(db, user, "fixture_ingest", "detection", detection_id, filename)
    return {
        "file": filename,
        "status": "ingested",
        "detection_id": detection_id,
        "species": species,
        "confidence": analyzed.confidence,
        "review_state": review_state,
        "station": code,
        "provisional_id": provisional,
    }


def run(directory: Path, *, email: str | None = None, dry_run: bool = False) -> dict:
    Base.metadata.create_all(bind=engine)
    catalog = _load_catalog(directory)
    if not catalog:
        raise SystemExit(f"No JPG files in {directory}")

    db = SessionLocal()
    try:
        user = _pick_user(db, email)
        project = _ensure_project(db, user)
        results = []
        for row in catalog:
            results.append(ingest_one(db, user=user, project=project, row=row, dry_run=dry_run))
        refreshed = 0
        if not dry_run:
            refreshed = refresh_fixture_coords(db, project, catalog)
            db.commit()
        return {
            "directory": str(directory),
            "uploader": user.email,
            "project_id": project.id,
            "project_name": project.name,
            "dry_run": dry_run,
            "coords_refreshed": refreshed,
            "results": results,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Ingest fixture jaguars into Patterns")
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--email", help="Uploader account email (defaults to first admin/scientist)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = run(args.dir, email=args.email, dry_run=args.dry_run)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
