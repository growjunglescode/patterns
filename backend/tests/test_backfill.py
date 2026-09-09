"""Backfill tests for the ML match library.

Torch is mocked via an injected encoder, exactly like test_recognition.py, so
nothing here downloads ResNet50 weights or needs a GPU.
"""

from __future__ import annotations

from datetime import datetime, timezone

import cv2
import numpy as np
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app import backfill_embeddings as backfill
from app.db import Base
from app.models import CoatEmbedding, Detection, Individual, Media, Project, User
from app.services.recognition import REVIEW_REJECTED, RecognitionService
from app.services.recognition.embedding_engine import EmbeddingRecognitionEngine


def _jpeg(color: tuple[int, int, int]) -> bytes:
    image = np.zeros((64, 64, 3), dtype=np.uint8)
    image[:] = color
    ok, buf = cv2.imencode(".jpg", image)
    assert ok
    return buf.tobytes()


def _fake_encoder(data: bytes) -> list[float]:
    """Stand-in for ResNet50: a deterministic 3-d vector, no torch involved."""
    seed = sum(data[:96]) % 5
    return [1.0, seed / 5.0, 0.25]


def _engine(version: str | None = None) -> EmbeddingRecognitionEngine:
    engine = EmbeddingRecognitionEngine(encoder=_fake_encoder)
    if version:
        engine.model_version = version
    return engine


class _Storage:
    """In-memory stand-in for LocalStorage / AzureBlobStorage."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def save(self, key: str, data: bytes, content_type: str = "image/jpeg") -> str:
        self.files[key] = data
        return key

    def read(self, key: str) -> bytes:
        if key not in self.files:
            raise FileNotFoundError(f"{key} is not in storage")
        return self.files[key]


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> _Storage:
    store = _Storage()
    monkeypatch.setattr(backfill, "get_storage", lambda: store)
    return store


@pytest.fixture
def catalog(db: Session) -> tuple[Project, User]:
    project = Project(name="Osa Jaguar Project", slug="osa-jaguar-project")
    user = User(
        email="ana@patterns.local",
        hashed_password="not-a-real-hash",
        display_name="Ana Reyes",
        role="scientist",
        verified=True,
    )
    db.add_all([project, user])
    db.flush()
    return project, user


def _individual(db: Session, project: Project, code: str) -> Individual:
    individual = Individual(project_id=project.id, code=code, species="jaguar", identity_status="unnamed")
    db.add(individual)
    db.flush()
    return individual


def _photo(
    db: Session,
    storage: _Storage,
    project: Project,
    user: User,
    *,
    individual: Individual | None,
    side: str = "L",
    grade: str = "research_grade",
    species: str = "jaguar",
    review_state: str | None = None,
    suggested: Individual | None = None,
    color: tuple[int, int, int] = (28, 95, 190),
    data: bytes | None = None,
    filename: str = "trap.jpg",
) -> tuple[Detection, Media]:
    detection = Detection(
        project_id=project.id,
        individual_id=individual.id if individual else None,
        suggested_individual_id=suggested.id if suggested else None,
        uploader_id=user.id,
        reviewer_id=user.id if individual else None,
        species=species,
        side=side,
        grade=grade,
        review_state=review_state,
        captured_at=datetime(2024, 5, 1, 7, 30, tzinfo=timezone.utc),
        latitude=8.54,
        longitude=-83.51,
        confidence=0.91,
    )
    db.add(detection)
    db.flush()
    key = f"{detection.id}/original.jpg"
    storage.save(key, data if data is not None else _jpeg(color))
    media = Media(
        detection_id=detection.id,
        kind="photo",
        storage_key=key,
        content_type="image/jpeg",
        original_filename=filename,
        is_best_frame=True,
    )
    db.add(media)
    db.flush()
    return detection, media


def _gallery(db: Session) -> list[CoatEmbedding]:
    return list(db.scalars(select(CoatEmbedding)).all())


def test_backfill_encodes_confirmed_photos_with_identity_and_metadata(db, storage, catalog):
    project, user = catalog
    jag = _individual(db, project, "JAG-0001")
    detection, media = _photo(db, storage, project, user, individual=jag, side="R")

    report = backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    assert (report.encoded, report.skipped, report.failed) == (1, 0, 0)
    row = _gallery(db)[0]
    assert row.individual_id == jag.id
    assert row.media_id == media.id
    assert row.detection_id == detection.id
    assert row.side == "R"
    assert row.captured_at is not None
    assert (row.latitude, row.longitude) == (8.54, -83.51)
    assert row.model_name == "resnet50"
    assert row.model_version == "resnet50-IMAGENET1K_V2"


def test_backfill_running_twice_does_not_duplicate_rows(db, storage, catalog):
    project, user = catalog
    _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0001"))
    _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0002"), side="R")

    lines: list[str] = []
    first = backfill.run_backfill(db, engine=_engine(), out=lines.append)
    second = backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    assert first.encoded == 2
    assert second.encoded == 0
    assert second.skipped == 2
    assert len(_gallery(db)) == 2
    assert any("Encoded 2 of 2 photos" in line for line in lines)


def test_backfill_keeps_left_and_right_flanks_separate(db, storage, catalog):
    project, user = catalog
    left_cat = _individual(db, project, "JAG-0001")
    right_cat = _individual(db, project, "JAG-0002")
    _photo(db, storage, project, user, individual=left_cat, side="L", color=(20, 80, 170))
    _photo(db, storage, project, user, individual=right_cat, side="R", color=(60, 120, 200))

    backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    sides = {row.individual_id: row.side for row in _gallery(db)}
    assert sides == {left_cat.id: "L", right_cat.id: "R"}

    service = RecognitionService(_engine())
    ranked = service.rank_candidates(
        db,
        identity_embedding=[1.0, 0.4, 0.25],
        opencv_embedding=[],
        species="jaguar",
        side="L",
    )
    assert [individual.id for individual, _score in ranked] == [left_cat.id]


def test_backfill_skips_unconfirmed_and_rejected_identities(db, storage, catalog):
    project, user = catalog
    jag = _individual(db, project, "JAG-0001")
    # AI guess only — identity lives in suggested_individual_id, nobody confirmed it.
    _photo(db, storage, project, user, individual=None, grade="needs_id", suggested=jag)
    # No animal identified and no field data.
    _photo(db, storage, project, user, individual=None, grade="casual", species="unknown")
    # A reviewer said the suggestion was wrong.
    _photo(db, storage, project, user, individual=jag, grade="confirmed", review_state=REVIEW_REJECTED)

    report = backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    assert report.found == 0
    assert report.encoded == 0
    assert _gallery(db) == []


def test_backfill_keeps_going_when_one_image_is_corrupt(db, storage, catalog):
    project, user = catalog
    good = _individual(db, project, "JAG-0001")
    broken = _individual(db, project, "JAG-0002")
    _photo(db, storage, project, user, individual=good, filename="good.jpg")
    _, bad_media = _photo(
        db,
        storage,
        project,
        user,
        individual=broken,
        data=b"this is not an image",
        filename="broken.jpg",
    )

    lines: list[str] = []
    report = backfill.run_backfill(db, engine=_engine(), out=lines.append)

    assert report.encoded == 1
    assert report.failed == 1
    rows = _gallery(db)
    assert len(rows) == 1
    assert rows[0].individual_id == good.id
    assert bad_media.id not in {row.media_id for row in rows}
    assert any("broken.jpg" in failure for failure in report.failures)
    assert any("broken.jpg" in line for line in lines)


def test_backfill_reports_a_missing_file_instead_of_crashing(db, storage, catalog):
    project, user = catalog
    _, media = _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0001"))
    storage.files.pop(media.storage_key)

    report = backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    assert (report.encoded, report.failed) == (0, 1)
    assert _gallery(db) == []


def test_backfill_dry_run_writes_nothing(db, storage, catalog):
    project, user = catalog
    _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0001"))

    report = backfill.run_backfill(db, engine=_engine(), dry_run=True, out=lambda _line: None)

    assert report.planned == 1
    assert report.encoded == 0
    assert _gallery(db) == []


def test_backfill_limit_stops_early(db, storage, catalog):
    project, user = catalog
    for n in range(3):
        _photo(db, storage, project, user, individual=_individual(db, project, f"JAG-000{n}"))

    report = backfill.run_backfill(db, engine=_engine(), limit=2, out=lambda _line: None)

    assert report.found == 3
    assert report.encoded == 2
    assert len(_gallery(db)) == 2


def test_backfill_reencodes_under_a_new_model_version(db, storage, catalog):
    project, user = catalog
    _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0001"))

    backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)
    report = backfill.run_backfill(db, engine=_engine("resnet50-NEXT"), out=lambda _line: None)

    assert report.skipped == 0
    assert report.encoded == 1
    assert {row.model_version for row in _gallery(db)} == {"resnet50-IMAGENET1K_V2", "resnet50-NEXT"}


def test_backfill_relinks_an_embedding_left_without_an_identity(db, storage, catalog):
    project, user = catalog
    jag = _individual(db, project, "JAG-0001")
    detection, media = _photo(db, storage, project, user, individual=jag)
    db.add(
        CoatEmbedding(
            media_id=media.id,
            detection_id=detection.id,
            individual_id=None,
            embedding_json="[1.0, 0.0, 0.0]",
            side="L",
            model_name="resnet50",
            model_version="resnet50-IMAGENET1K_V2",
        )
    )
    db.flush()

    report = backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    rows = _gallery(db)
    assert len(rows) == 1
    assert rows[0].individual_id == jag.id
    assert report.relinked == 1
    assert report.encoded == 0


def test_backfill_explains_itself_when_the_model_cannot_load(db, storage, catalog):
    dead = EmbeddingRecognitionEngine()
    dead._attempted = True
    dead._model = None

    with pytest.raises(backfill.ModelUnavailable) as excinfo:
        backfill.run_backfill(db, engine=dead, out=lambda _line: None)

    message = str(excinfo.value)
    assert "pip install torch torchvision" in message
    assert "Traceback" not in message


def test_library_status_explains_a_cold_start(db, storage, catalog):
    service = RecognitionService(_engine())
    empty = service.library_status(db)
    assert empty.size == 0
    assert empty.ready is False
    assert "still being built" in (empty.note or "")

    project, user = catalog
    _photo(db, storage, project, user, individual=_individual(db, project, "JAG-0001"))
    backfill.run_backfill(db, engine=_engine(), out=lambda _line: None)

    thin = service.library_status(db)
    assert thin.size == 1
    assert thin.ready is False
    assert "only 1 confirmed photo" in (thin.note or "")
