"""Model report card: read-only visibility into recorded match decisions.

These endpoints only read `match_reviews` (and the detections they point at).
Nothing here alters matching, thresholds, or identity assignment.
"""

from __future__ import annotations

from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth import require_roles
from app.config import get_settings
from app.db import get_db
from app.models import CoatEmbedding, Detection, Individual, MatchReview, Media, User
from app.services import get_storage
from app.services.identity import display_label, generalize
from app.services.model_report import (
    ACCURACY_BASIS,
    MIN_BUCKET_REVIEWS,
    MIN_REVIEWS_FOR_ACCURACY,
    SMALL_SAMPLE_NOTE,
    TOP_K_NOTE,
    detection_outcomes,
    engine_breakdown,
    engine_comparison_note,
    engine_label,
    model_version_breakdown,
    parse_snapshot,
    score_buckets,
    stats_block,
    threshold_reading,
)
from app.services.recognition.types import REVIEW_LABELS

router = APIRouter(prefix="/api/model", tags=["model-report"])

MAX_PAGE_SIZE = 200

EMPTY_STATE_NOTE = (
    "No match decisions have been recorded yet. This page fills in as people confirm "
    "or reject suggested matches — every decision is logged with the engine, the model "
    "version and the similarity score behind it."
)


def _parse_boundary(value: str | None, *, end_of_day: bool) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from exc
    if len(text) == 10:  # a bare YYYY-MM-DD covers the whole day
        parsed = datetime.combine(parsed.date(), time.max if end_of_day else time.min)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _review_query(
    start: datetime | None,
    end: datetime | None,
    engine: str | None,
    model_version: str | None,
    project_id: str | None = None,
):
    stmt = select(MatchReview)
    if start is not None:
        stmt = stmt.where(MatchReview.created_at >= start)
    if end is not None:
        stmt = stmt.where(MatchReview.created_at <= end)
    if engine:
        stmt = stmt.where(MatchReview.engine == engine)
    if model_version:
        stmt = stmt.where(MatchReview.model_version == model_version)
    if project_id:
        stmt = stmt.join(Detection, MatchReview.detection_id == Detection.id).where(
            Detection.project_id == project_id
        )
    return stmt


def _load_reviews(
    db: Session,
    start: str | None,
    end: str | None,
    engine: str | None,
    model_version: str | None,
    project_id: str | None = None,
) -> list[MatchReview]:
    stmt = _review_query(
        _parse_boundary(start, end_of_day=False),
        _parse_boundary(end, end_of_day=True),
        engine,
        model_version,
        project_id,
    ).order_by(MatchReview.created_at.asc())
    return list(db.scalars(stmt).all())


def _available_filters(db: Session) -> dict:
    engines = [row for row in db.scalars(select(MatchReview.engine).distinct()).all() if row]
    versions = [
        {"engine": eng, "model_version": ver}
        for eng, ver in db.execute(
            select(MatchReview.engine, MatchReview.model_version).distinct()
        ).all()
        if ver
    ]
    first = db.scalar(select(func.min(MatchReview.created_at)))
    last = db.scalar(select(func.max(MatchReview.created_at)))
    return {
        "engines": sorted(engines),
        "engine_labels": {name: engine_label(name) for name in sorted(engines)},
        "model_versions": sorted(
            versions, key=lambda row: (row["engine"] or "", row["model_version"] or "")
        ),
        "review_states": [
            {"value": value, "label": label} for value, label in REVIEW_LABELS.items()
        ],
        "first_review_at": first,
        "last_review_at": last,
    }


def _threshold_block() -> dict:
    settings = get_settings()
    return {
        "suggest": settings.suggest_threshold,
        "confirm": settings.match_threshold,
        "note": (
            "These two similarity thresholds were chosen by hand, not derived from "
            "data. The distribution below is the evidence for whether they are set in "
            "roughly the right place."
        ),
    }


@router.get("/summary")
def model_summary(
    start: str | None = None,
    end: str | None = None,
    engine: str | None = None,
    model_version: str | None = None,
    project_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    """Accuracy of recorded match decisions, overall and per engine / model version."""
    rows = _load_reviews(db, start, end, engine, model_version, project_id)
    outcomes = detection_outcomes(rows)
    by_engine = engine_breakdown(rows)

    total_detections = db.scalar(select(func.count()).select_from(Detection)) or 0
    reviewed_detections = (
        db.scalar(
            select(func.count()).select_from(Detection).where(Detection.reviewer_id.is_not(None))
        )
        or 0
    )
    coat_rows = db.scalar(select(func.count()).select_from(CoatEmbedding)) or 0
    all_reviews = db.scalar(select(func.count()).select_from(MatchReview)) or 0

    return {
        "generated_at": datetime.now(timezone.utc),
        "filters": {
            "start": start,
            "end": end,
            "engine": engine,
            "model_version": model_version,
        },
        "available": _available_filters(db),
        "thresholds": _threshold_block(),
        "overall": stats_block(rows, outcomes),
        "by_engine": by_engine,
        "by_model_version": model_version_breakdown(rows),
        "engine_comparison_note": engine_comparison_note(by_engine),
        "context": {
            "reviews_recorded_all_time": all_reviews,
            "reviews_in_current_filter": len(rows),
            "detections_total": total_detections,
            "detections_with_a_reviewer": reviewed_detections,
            "coat_embeddings_stored": coat_rows,
            "note": (
                f"{reviewed_detections} of {total_detections} photos carry a reviewer, "
                f"but only {all_reviews} decision"
                f"{' has' if all_reviews == 1 else 's have'} been captured in the audit "
                "trail. Decisions made before the audit trail existed cannot be scored "
                "and are not counted anywhere on this page."
            ),
        },
        "notes": {
            "accuracy_basis": ACCURACY_BASIS,
            "small_sample": SMALL_SAMPLE_NOTE,
            "top_k": TOP_K_NOTE,
            "empty_state": EMPTY_STATE_NOTE if all_reviews == 0 else None,
        },
        "minimum_reviews_for_accuracy": MIN_REVIEWS_FOR_ACCURACY,
    }


@router.get("/score-distribution")
def model_score_distribution(
    start: str | None = None,
    end: str | None = None,
    engine: str | None = None,
    model_version: str | None = None,
    project_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    """Top-1 accuracy bucketed by similarity score, plus a reading of the thresholds."""
    rows = _load_reviews(db, start, end, engine, model_version, project_id)
    outcomes = detection_outcomes(rows)
    thresholds = _threshold_block()
    buckets = score_buckets(outcomes)
    return {
        "generated_at": datetime.now(timezone.utc),
        "filters": {
            "start": start,
            "end": end,
            "engine": engine,
            "model_version": model_version,
        },
        "thresholds": thresholds,
        "bucket_width": 0.1,
        "minimum_per_bucket": MIN_BUCKET_REVIEWS,
        "buckets": buckets,
        "evaluated": sum(bucket["evaluated"] for bucket in buckets),
        "reading": threshold_reading(outcomes, thresholds["suggest"], thresholds["confirm"]),
        "notes": {
            "accuracy_basis": ACCURACY_BASIS,
            "top_k": TOP_K_NOTE,
            "empty_state": (
                "No scored decisions yet, so there is no distribution to draw."
                if not buckets
                else None
            ),
        },
    }


def _photo_url(db: Session, detection: Detection | None, media_id: str | None) -> str | None:
    media = db.get(Media, media_id) if media_id else None
    if media is None and detection is not None:
        candidates = [item for item in detection.media if item.kind != "video"]
        media = next((item for item in candidates if item.is_best_frame), None) or (
            candidates[0] if candidates else None
        )
    return get_storage().public_url(media.storage_key) if media else None


@router.get("/decisions")
def model_decisions(
    start: str | None = None,
    end: str | None = None,
    engine: str | None = None,
    model_version: str | None = None,
    review_state: str | None = None,
    outcome: str | None = Query(None, pattern="^(correct|incorrect|undecided)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "scientist")),
) -> dict:
    """Paginated audit trail of individual match decisions."""
    stmt = _review_query(
        _parse_boundary(start, end_of_day=False),
        _parse_boundary(end, end_of_day=True),
        engine,
        model_version,
        project_id,
    )
    if review_state:
        stmt = stmt.where(MatchReview.review_state == review_state)
    if outcome == "correct":
        stmt = stmt.where(MatchReview.was_correct.is_(True))
    elif outcome == "incorrect":
        stmt = stmt.where(MatchReview.was_correct.is_(False))
    elif outcome == "undecided":
        stmt = stmt.where(MatchReview.was_correct.is_(None))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(MatchReview.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )

    detection_ids = {row.detection_id for row in rows}
    detections = {
        item.id: item
        for item in db.scalars(
            select(Detection)
            .options(selectinload(Detection.media), selectinload(Detection.station))
            .where(Detection.id.in_(detection_ids))
        ).all()
    } if detection_ids else {}

    individual_ids = {row.suggested_individual_id for row in rows} | {
        row.confirmed_individual_id for row in rows
    }
    individual_ids.discard(None)
    individuals = {
        item.id: item
        for item in db.scalars(select(Individual).where(Individual.id.in_(individual_ids))).all()
    } if individual_ids else {}

    actor_ids = {row.actor_id for row in rows}
    actor_ids.discard(None)
    actors = {
        item.id: item
        for item in db.scalars(select(User).where(User.id.in_(actor_ids))).all()
    } if actor_ids else {}

    items = []
    for row in rows:
        detection = detections.get(row.detection_id)
        suggested = individuals.get(row.suggested_individual_id)
        confirmed = individuals.get(row.confirmed_individual_id)
        actor = actors.get(row.actor_id)
        own = bool(detection and (detection.uploader_id == user.id or user.role == "admin"))
        lat, lon = generalize(
            detection.latitude if detection else None,
            detection.longitude if detection else None,
            user.role,
            own,
        )
        items.append(
            {
                "id": row.id,
                "created_at": row.created_at,
                "detection_id": row.detection_id,
                "detection_exists": detection is not None,
                "captured_at": detection.captured_at if detection else None,
                "station_code": detection.station.code if detection and detection.station else None,
                "latitude": lat,
                "longitude": lon,
                "photo_url": _photo_url(db, detection, row.media_id),
                "engine": row.engine,
                "engine_label": engine_label(row.engine),
                "model_version": row.model_version,
                "review_state": row.review_state,
                "review_state_label": REVIEW_LABELS.get(row.review_state, row.review_state),
                "suggested_individual_id": row.suggested_individual_id,
                "suggested_code": suggested.code if suggested else None,
                "suggested_name": display_label(suggested) if suggested else None,
                "similarity_score": row.similarity_score,
                "confirmed_individual_id": row.confirmed_individual_id,
                "confirmed_code": confirmed.code if confirmed else None,
                "confirmed_name": display_label(confirmed) if confirmed else None,
                "was_correct": row.was_correct,
                "decided_by": actor.display_name if actor else None,
                "candidate_count": len(parse_snapshot(row.candidate_snapshot_json)),
            }
        )

    pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": pages,
        "has_more": page < pages,
        "notes": {
            "accuracy_basis": ACCURACY_BASIS,
            "location": (
                "Coordinates are generalised to match what your role is allowed to see."
            ),
            "empty_state": EMPTY_STATE_NOTE if total == 0 and not review_state and not outcome else None,
        },
    }
