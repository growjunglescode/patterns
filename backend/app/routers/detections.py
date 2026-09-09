from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import can_name, get_current_user
from app.roles import canonical_role
from app.config import get_settings
from app.db import get_db
from app.models import CameraStation, CoatEmbedding, Detection, Individual, Media, NamingClaim, Project, User
from app.schemas import AssertSpeciesRequest, ConfirmRequest, DetectionOut, MetadataPatch
from app.services import get_storage
from app.services.exif import extract_exif
from app.services.identity import (
    assert_name_free,
    attach_embedding,
    audit,
    grade_detection,
    next_code,
)
from app.services.species import canonical_species, is_identifiable_species, normalize_side, require_jaguar
from app.services.recognition import (
    REVIEW_AWAITING_SECOND,
    REVIEW_CONFIRMED,
    REVIEW_NEW,
    REVIEW_POTENTIAL,
    REVIEW_REJECTED,
    get_recognition_service,
)
from app.services.serialize import detection_out, guess_content_type
from app.services.vision import best_frame_from_video

router = APIRouter(prefix="/api", tags=["detections"])

PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}


def _load(db: Session, detection_id: str) -> Detection | None:
    return db.scalar(
        select(Detection)
        .options(
            selectinload(Detection.media),
            selectinload(Detection.individual).selectinload(Individual.project),
            selectinload(Detection.suggested_individual),
            selectinload(Detection.station),
            selectinload(Detection.project),
        )
        .where(Detection.id == detection_id)
    )


def nearest_station(db: Session, project_id: str, lat: float, lon: float) -> CameraStation | None:
    stations = db.scalars(select(CameraStation).where(CameraStation.project_id == project_id)).all()
    best: CameraStation | None = None
    best_d = 1e9
    for station in stations:
        dist = (station.latitude - lat) ** 2 + (station.longitude - lon) ** 2
        if dist < best_d:
            best_d = dist
            best = station
    if best and best_d ** 0.5 < 0.04:
        return best
    return None


def _opencv_embedding(detection: Detection) -> list[float]:
    best = next((m for m in detection.media if m.embedding_json), None)
    if best and best.embedding_json:
        return json.loads(best.embedding_json)
    return []


def _best_media(detection: Detection) -> Media | None:
    return next((m for m in detection.media if m.is_best_frame), None) or (
        detection.media[0] if detection.media else None
    )


def _rank_detection(
    db: Session,
    detection: Detection,
    *,
    opencv_embedding: list[float] | None = None,
    identity_embedding: list[float] | None = None,
) -> list[tuple[Individual, float]]:
    service = get_recognition_service()
    opencv = opencv_embedding if opencv_embedding is not None else _opencv_embedding(detection)
    identity = identity_embedding
    if identity is None:
        identity = opencv
        if service.engine.stores_coat_embeddings:
            coat = db.scalar(select(CoatEmbedding).where(CoatEmbedding.detection_id == detection.id))
            if coat and coat.embedding_json:
                identity = json.loads(coat.embedding_json)
    species = detection.species if detection.species not in {"unknown", "other_or_empty", "unreadable", "possible_felid"} else "jaguar"
    return service.rank_candidates(
        db,
        identity_embedding=identity or [],
        opencv_embedding=opencv or [],
        species=species,
        side=normalize_side(detection.side),
        project_id=detection.project_id,
    )


@router.post("/uploads", response_model=DetectionOut)
async def upload(
    file: UploadFile = File(...),
    project_id: str | None = Form(None),
    station_id: str | None = Form(None),
    captured_at: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    notes: str | None = Form(None),
    side: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DetectionOut:
    if user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot upload")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in PHOTO_TYPES and content_type not in VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Upload a camera-trap photo or video")

    data = await file.read()
    if not data or len(data) > 80 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Empty or oversized file")

    project = None
    if project_id:
        project = db.get(Project, project_id)
    if not project:
        from app.services.onboarding import resolve_user_project

        project = resolve_user_project(db, user)
    if not project:
        project = db.scalar(select(Project).limit(1))
    if not project:
        raise HTTPException(status_code=400, detail="No project available — finish profile setup first")

    station = db.get(CameraStation, station_id) if station_id else None
    exif = extract_exif(data) if content_type in PHOTO_TYPES or content_type.startswith("image/") else {
        "latitude": None,
        "longitude": None,
        "captured_at": None,
        "camera_make": None,
        "camera_model": None,
        "source": [],
    }
    sources: list[str] = list(exif.get("source") or [])
    lat = latitude if latitude is not None else exif.get("latitude")
    lon = longitude if longitude is not None else exif.get("longitude")
    if latitude is not None:
        sources.append("manual_gps")
    parsed_captured = None
    if captured_at:
        try:
            parsed_captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
            sources.append("manual_time")
        except ValueError:
            parsed_captured = None
    if parsed_captured is None:
        parsed_captured = exif.get("captured_at")
    if station:
        sources.append("station")
        if lat is None:
            lat = station.latitude
            lon = station.longitude
    elif lat is not None and lon is not None:
        snapped = nearest_station(db, project.id, lat, lon)
        if snapped:
            station = snapped
            sources.append("station_snap")

    storage = get_storage()
    detection_id = str(uuid.uuid4())
    original = file.filename or "upload"
    suffix = Path(original).suffix or (".mp4" if content_type in VIDEO_TYPES else ".jpg")
    key = f"{detection_id}/original{suffix}"
    storage.save(key, data, content_type)
    kind = "video" if content_type in VIDEO_TYPES else "photo"

    recognition = get_recognition_service()
    analyze_bytes = data
    frame_media_kwargs = None
    if kind == "video":
        extracted = best_frame_from_video(data)
        if extracted:
            frame_bytes, _opencv_pick = extracted
            storage.save(f"{detection_id}/best-frame.jpg", frame_bytes, "image/jpeg")
            analyze_bytes = frame_bytes
            frame_media_kwargs = {
                "detection_id": detection_id,
                "kind": "frame",
                "storage_key": f"{detection_id}/best-frame.jpg",
                "content_type": "image/jpeg",
                "original_filename": "best-frame.jpg",
                "is_best_frame": True,
            }

    analyzed = recognition.analyze(analyze_bytes)
    opencv_embedding = analyzed.opencv_embedding
    identity_embedding = analyzed.identity_embedding
    frame_media = None
    if frame_media_kwargs is not None:
        frame_media_kwargs["embedding_json"] = json.dumps(opencv_embedding) if opencv_embedding else None
        frame_media = Media(**frame_media_kwargs)

    species = "jaguar" if analyzed.is_jaguar else (analyzed.species_label or "unknown")
    flank = normalize_side(side)

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
        station_id=station.id if station else None,
        suggested_individual_id=suggested.id if suggested and score and score >= settings.suggest_threshold else None,
        uploader_id=user.id,
        species=species,
        side=flank,
        captured_at=parsed_captured,
        latitude=lat,
        longitude=lon,
        confidence=analyzed.confidence,
        match_score=round(score, 4) if score is not None else None,
        summary=analyzed.summary,
        notes=notes,
        camera_make=exif.get("camera_make"),
        camera_model=exif.get("camera_model"),
        metadata_source=",".join(dict.fromkeys(sources)) or "none",
        review_state=review_state,
        recognition_engine=analyzed.engine,
        recognition_model_version=analyzed.model_version,
    )
    detection.grade = grade_detection(db, detection)
    db.add(detection)
    if frame_media is not None:
        db.add(frame_media)
    photo_media = Media(
        detection_id=detection_id,
        kind=kind,
        storage_key=key,
        content_type=content_type,
        original_filename=original,
        is_best_frame=kind == "photo",
        embedding_json=json.dumps(opencv_embedding) if opencv_embedding else None,
    )
    db.add(photo_media)
    db.flush()
    stored_media = frame_media or photo_media
    recognition.store_coat_embedding(
        db,
        detection=detection,
        media=stored_media,
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
            media_id=stored_media.id,
        )
    audit(db, user, "upload", "detection", detection_id, original)
    db.commit()
    loaded = _load(db, detection_id)
    return detection_out(db, loaded, user, candidates, include_match_library=True)


@router.get("/detections", response_model=list[DetectionOut])
def list_detections(
    grade: str | None = None,
    project_id: str | None = None,
    individual_id: str | None = None,
    uploader_id: str | None = None,
    review_state: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DetectionOut]:
    stmt = (
        select(Detection)
        .options(
            selectinload(Detection.media),
            selectinload(Detection.individual),
            selectinload(Detection.suggested_individual),
            selectinload(Detection.station),
            selectinload(Detection.project),
        )
        .order_by(Detection.created_at.desc())
    )
    if grade:
        stmt = stmt.where(Detection.grade == grade)
    if project_id:
        stmt = stmt.where(Detection.project_id == project_id)
    if individual_id:
        stmt = stmt.where(Detection.individual_id == individual_id)
    if review_state:
        stmt = stmt.where(Detection.review_state == review_state)
    if uploader_id and canonical_role(user.role) == "admin":
        stmt = stmt.where(Detection.uploader_id == uploader_id)
    return [detection_out(db, row, user) for row in db.scalars(stmt).all()]


@router.get("/detections/{detection_id}", response_model=DetectionOut)
def get_detection(
    detection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DetectionOut:
    detection = _load(db, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    candidates = _rank_detection(db, detection)
    return detection_out(db, detection, user, candidates, include_match_library=True)


@router.post("/detections/{detection_id}/confirm", response_model=DetectionOut)
def confirm_detection(
    detection_id: str,
    payload: ConfirmRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DetectionOut:
    if not can_name(user):
        raise HTTPException(status_code=403, detail="Only verified researchers can confirm identity")
    detection = _load(db, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    if not is_identifiable_species(db, detection.species):
        raise HTTPException(status_code=400, detail="Confirm the species before matching or naming")
    try:
        require_jaguar(detection.species)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Identity work always requires a human and a map location (EXIF or manual).
    if not payload.reject and (detection.latitude is None or detection.longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Add GPS or choose a camera station before matching or naming this jaguar",
        )
    if payload.side:
        detection.side = normalize_side(payload.side)
    if payload.species:
        try:
            detection.species = require_jaguar(payload.species)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    recognition = get_recognition_service()
    embedding = _opencv_embedding(detection)
    suggested_id = detection.suggested_individual_id
    similarity = detection.match_score
    media = _best_media(detection)

    if payload.reject:
        detection.individual_id = None
        detection.suggested_individual_id = None
        detection.reviewer_id = user.id
        detection.review_state = REVIEW_REJECTED
        recognition.bind_coat_embeddings(db, detection.id, None)
        recognition.log_review(
            db,
            detection=detection,
            review_state=REVIEW_REJECTED,
            suggested_individual_id=suggested_id,
            confirmed_individual_id=None,
            similarity_score=similarity,
            candidates=None,
            actor=user,
            media_id=media.id if media else None,
        )
        audit(db, user, "reject_match", "detection", detection.id, suggested_id)
    elif payload.create_new:
        try:
            species = require_jaguar(canonical_species(db, detection.species))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        individual = Individual(
            project_id=detection.project_id,
            code=next_code(db, species),
            species=species,
            identity_status="unnamed",
        )
        db.add(individual)
        db.flush()
        attach_embedding(individual, embedding, detection.side)
        recognition.bind_coat_embeddings(db, detection.id, individual.id)
        detection.individual_id = individual.id
        detection.reviewer_id = user.id
        detection.review_state = REVIEW_NEW
        audit(db, user, "create_individual", "individual", individual.id, individual.code)
        recognition.log_review(
            db,
            detection=detection,
            review_state=REVIEW_NEW,
            suggested_individual_id=suggested_id,
            confirmed_individual_id=individual.id,
            similarity_score=similarity,
            candidates=None,
            actor=user,
            media_id=media.id if media else None,
        )
        if payload.proposed_name:
            key = assert_name_free(db, payload.proposed_name, individual.id)
            db.add(
                NamingClaim(
                    individual_id=individual.id,
                    proposed_name=" ".join(payload.proposed_name.strip().split()),
                    name_key=key,
                    proposer_id=user.id,
                    status="pending",
                )
            )
            individual.identity_status = "under_review"
            audit(db, user, "propose_name", "naming_claim", individual.id, payload.proposed_name)
    elif payload.individual_id:
        individual = db.get(Individual, payload.individual_id)
        if not individual:
            raise HTTPException(status_code=404, detail="Individual not found")
        if individual.project_id != detection.project_id:
            raise HTTPException(status_code=400, detail="Individual belongs to a different project")
        # Second reviewer: same individual already linked by someone else.
        if (
            detection.individual_id == individual.id
            and detection.reviewer_id
            and detection.reviewer_id != user.id
            and not getattr(detection, "second_reviewer_id", None)
        ):
            detection.second_reviewer_id = user.id
            detection.review_state = REVIEW_CONFIRMED
            audit(db, user, "second_review", "detection", detection.id, individual.code)
            recognition.log_review(
                db,
                detection=detection,
                review_state=REVIEW_CONFIRMED,
                suggested_individual_id=suggested_id,
                confirmed_individual_id=individual.id,
                similarity_score=similarity,
                candidates=None,
                actor=user,
                media_id=media.id if media else None,
            )
        else:
            attach_embedding(individual, embedding, detection.side)
            recognition.bind_coat_embeddings(db, detection.id, individual.id)
            detection.individual_id = individual.id
            detection.reviewer_id = user.id
            detection.review_state = REVIEW_AWAITING_SECOND
            audit(db, user, "confirm_match", "detection", detection.id, individual.code)
            recognition.log_review(
                db,
                detection=detection,
                review_state=REVIEW_AWAITING_SECOND,
                suggested_individual_id=suggested_id,
                confirmed_individual_id=individual.id,
                similarity_score=similarity,
                candidates=None,
                actor=user,
                media_id=media.id if media else None,
            )
    else:
        raise HTTPException(status_code=400, detail="Provide individual_id, create_new, or reject")

    detection.grade = grade_detection(db, detection)
    db.commit()
    loaded = _load(db, detection_id)
    return detection_out(db, loaded, user)


@router.patch("/detections/{detection_id}/metadata", response_model=DetectionOut)
def patch_metadata(
    detection_id: str,
    payload: MetadataPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DetectionOut:
    detection = _load(db, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    if payload.station_id:
        station = db.get(CameraStation, payload.station_id)
        if not station:
            raise HTTPException(status_code=404, detail="Station not found")
        detection.station_id = station.id
        detection.latitude = station.latitude
        detection.longitude = station.longitude
        detection.metadata_source = f"{detection.metadata_source or ''},manual_station".strip(",")
    if payload.latitude is not None and payload.longitude is not None:
        detection.latitude = payload.latitude
        detection.longitude = payload.longitude
        if not payload.station_id:
            snapped = nearest_station(db, detection.project_id, payload.latitude, payload.longitude)
            if snapped:
                detection.station_id = snapped.id
        detection.metadata_source = f"{detection.metadata_source or ''},manual_gps".strip(",")
    elif payload.latitude is not None or payload.longitude is not None:
        raise HTTPException(status_code=400, detail="Provide both latitude and longitude")
    if (
        detection.latitude is None
        and detection.longitude is None
        and not payload.station_id
        and payload.captured_at is None
        and payload.notes is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Choose a camera station or enter latitude and longitude",
        )
    if payload.captured_at:
        try:
            detection.captured_at = datetime.fromisoformat(payload.captured_at.replace("Z", "+00:00"))
            detection.metadata_source = f"{detection.metadata_source or ''},manual_time".strip(",")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid captured_at") from exc
    if payload.notes is not None:
        detection.notes = payload.notes
    detection.grade = grade_detection(db, detection)
    db.commit()
    loaded = _load(db, detection_id)
    return detection_out(db, loaded, user)


@router.post("/detections/{detection_id}/assert-species", response_model=DetectionOut)
def assert_species(
    detection_id: str,
    payload: AssertSpeciesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DetectionOut:
    detection = _load(db, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    if detection.uploader_id != user.id and canonical_role(user.role) not in {"admin", "scientist"}:
        raise HTTPException(status_code=403, detail="Not allowed")
    slug = canonical_species(db, payload.species)
    try:
        slug = require_jaguar(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not is_identifiable_species(db, slug):
        raise HTTPException(status_code=400, detail="Unknown or non-pattern species")
    detection.species = slug
    detection.summary = (
        f"{detection.summary or ''} Human confirmed this is a {slug} and pushed the picture."
    ).strip()
    candidates = _rank_detection(db, detection)
    settings = get_settings()
    if candidates:
        detection.suggested_individual_id = candidates[0][0].id
        detection.match_score = round(candidates[0][1], 4)
        if candidates[0][1] >= settings.suggest_threshold:
            detection.review_state = REVIEW_POTENTIAL
    detection.grade = grade_detection(db, detection)
    audit(db, user, "assert_species", "detection", detection.id, slug)
    db.commit()
    loaded = _load(db, detection_id)
    return detection_out(db, loaded, user, candidates, include_match_library=True)


@router.delete("/detections/{detection_id}")
def delete_detection(
    detection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    detection = _load(db, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    if detection.uploader_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(detection)
    db.commit()
    return {"status": "discarded"}


@router.get("/media/{key:path}")
def get_media(key: str) -> Response:
    data = get_storage().read(key)
    return Response(content=data, media_type=guess_content_type(key))
