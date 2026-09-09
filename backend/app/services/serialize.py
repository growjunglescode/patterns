from pathlib import Path

from sqlalchemy.orm import Session

from app.roles import canonical_role
from app.models import Detection, Individual, Media, NamingClaim, User
from app.schemas import (
    CandidateOut,
    DetectionOut,
    IndividualOut,
    MediaOut,
    MovementSummaryOut,
    NamingClaimOut,
    UserOut,
)
from app.services import get_storage
from app.services.identity import detection_count, display_label, generalize
from app.services.recognition import get_recognition_service
from app.services.monitoring import individual_monitoring
from app.services.species import is_identifiable_species


def user_out(user: User, photo_count: int = 0) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=canonical_role(user.role),
        verified=user.verified,
        orcid=user.orcid,
        organization=getattr(user, "organization", None),
        bio=getattr(user, "bio", None),
        profile_public=bool(getattr(user, "profile_public", False)),
        photo_count=photo_count,
        affiliation_type=getattr(user, "affiliation_type", None),
        phone=getattr(user, "phone", None),
        country=getattr(user, "country", None),
        city=getattr(user, "city", None),
        study_country=getattr(user, "study_country", None),
        study_region=getattr(user, "study_region", None),
        onboarding_complete=bool(getattr(user, "onboarding_complete", False)),
        home_project_id=getattr(user, "home_project_id", None),
    )


def media_out(item: Media) -> MediaOut:
    return MediaOut(
        id=item.id,
        kind=item.kind,
        url=get_storage().public_url(item.storage_key),
        content_type=item.content_type,
        original_filename=item.original_filename,
        is_best_frame=item.is_best_frame,
    )


def individual_out(
    db: Session,
    individual: Individual,
    monitoring: dict | None = None,
) -> IndividualOut:
    stats = monitoring if monitoring is not None else individual_monitoring(db, individual.id)
    editor_id = getattr(individual, "details_updated_by_id", None)
    editor = db.get(User, editor_id) if editor_id else None
    return IndividualOut(
        id=individual.id,
        code=individual.code,
        display_name=display_label(individual),
        species=individual.species,
        sex=individual.sex,
        life_status=individual.life_status,
        identity_status=individual.identity_status,
        named_by_id=individual.named_by_id,
        detection_count=detection_count(db, individual.id),
        project_id=individual.project_id,
        project_name=individual.project.name if individual.project else None,
        share_public=bool(getattr(individual, "share_public", False)),
        created_at=individual.created_at,
        first_seen=stats.get("first_seen"),
        last_seen=stats.get("last_seen"),
        days_since_seen=stats.get("days_since_seen"),
        sighting_count=stats.get("sighting_count", 0),
        active_last_90_days=bool(stats.get("active_last_90_days")),
        movement=MovementSummaryOut(**stats["movement"]) if stats.get("movement") else None,
        age_class=getattr(individual, "age_class", None),
        birth_year_estimate=getattr(individual, "birth_year_estimate", None),
        physical_notes=getattr(individual, "physical_notes", None),
        details_updated_by=editor.display_name if editor else None,
        details_updated_at=getattr(individual, "details_updated_at", None),
    )


def detection_out(
    db: Session,
    detection: Detection,
    user: User,
    candidates: list[tuple[Individual, float]] | None = None,
    *,
    include_match_library: bool = False,
) -> DetectionOut:
    # Only the endpoints that actually ran matching ask for the library size,
    # so list responses do not pay for the extra count query.
    library = (
        get_recognition_service().library_status(db, project_id=detection.project_id)
        if include_match_library
        else None
    )
    own = detection.uploader_id == user.id or user.role == "admin"
    lat, lon = generalize(detection.latitude, detection.longitude, user.role, own)
    individual = detection.individual
    suggested = detection.suggested_individual
    station = detection.station
    uploader = db.get(User, detection.uploader_id)
    reviewer = db.get(User, detection.reviewer_id) if detection.reviewer_id else None
    second = (
        db.get(User, detection.second_reviewer_id)
        if getattr(detection, "second_reviewer_id", None)
        else None
    )
    identity_status = individual.identity_status if individual else None
    named = identity_status == "named"
    identifiable = is_identifiable_species(db, detection.species)
    needs_species = not identifiable
    return DetectionOut(
        id=detection.id,
        project_id=detection.project_id,
        project_name=detection.project.name if detection.project else None,
        station_code=station.code if station else None,
        individual_id=detection.individual_id,
        individual_code=individual.code if individual else None,
        individual_name=display_label(individual) if individual else None,
        suggested_individual_id=detection.suggested_individual_id,
        suggested_name=display_label(suggested) if suggested else None,
        uploader_name=uploader.display_name if uploader else None,
        uploader_id=detection.uploader_id,
        reviewer_name=reviewer.display_name if reviewer else None,
        reviewer_id=detection.reviewer_id,
        second_reviewer_name=second.display_name if second else None,
        second_reviewer_id=getattr(detection, "second_reviewer_id", None),
        species=detection.species,
        side=detection.side,
        captured_at=detection.captured_at,
        latitude=lat,
        longitude=lon,
        confidence=detection.confidence,
        match_score=detection.match_score,
        grade=detection.grade,
        summary=detection.summary,
        notes=detection.notes,
        created_at=detection.created_at,
        media=[media_out(m) for m in detection.media],
        candidates=[
            CandidateOut(id=ind.id, code=ind.code, display_name=display_label(ind), score=round(score, 4))
            for ind, score in (candidates or [])
        ],
        missing_location=detection.latitude is None or detection.longitude is None,
        missing_time=detection.captured_at is None,
        camera_make=detection.camera_make,
        camera_model=detection.camera_model,
        metadata_source=detection.metadata_source,
        identity_status=identity_status,
        known_match=named,
        needs_name=bool(individual) and not named and identity_status != "under_review",
        is_identifiable=identifiable,
        needs_species_confirm=needs_species,
        engine=getattr(detection, "recognition_engine", None),
        model_version=getattr(detection, "recognition_model_version", None),
        review_state=getattr(detection, "review_state", None),
        match_library_size=library.size if library else None,
        match_library_ready=library.ready if library else None,
        match_library_note=library.note if library else None,
    )


def claim_out(db: Session, claim: NamingClaim) -> NamingClaimOut:
    proposer = db.get(User, claim.proposer_id)
    individual = claim.individual
    return NamingClaimOut(
        id=claim.id,
        individual_id=claim.individual_id,
        individual_code=individual.code if individual else "",
        proposed_name=claim.proposed_name,
        proposer_name=proposer.display_name if proposer else "",
        status=claim.status,
        created_at=claim.created_at,
    )


def guess_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": "video/webm",
    }.get(suffix, "application/octet-stream")
