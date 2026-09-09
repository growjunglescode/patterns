"""Pick a recognition engine and rank candidate jaguars. Never auto-names."""

from __future__ import annotations

import json
import logging
from typing import Protocol

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import CoatEmbedding, Detection, Individual, MatchReview, Media, User
from app.services.identity import ranked_candidates
from app.services.recognition.embedding_engine import EmbeddingRecognitionEngine
from app.services.recognition.opencv_engine import OpenCVRecognitionEngine
from app.services.recognition.ranking import cosine, evaluate_match, group_candidates_by_individual
from app.services.recognition.trained_engine import TrainedCoatEngine
from app.services.recognition.types import (
    GALLERY_WARMUP_PHOTOS,
    REVIEW_POTENTIAL,
    AnalyzeResult,
    MatchLibraryStatus,
)

logger = logging.getLogger(__name__)


class RecognitionEngine(Protocol):
    name: str
    model_version: str
    stores_coat_embeddings: bool

    def available(self) -> bool: ...

    def analyze(self, image_bytes: bytes) -> AnalyzeResult: ...


def requested_engine_name(settings: Settings | None = None) -> str:
    raw = (settings or get_settings()).recognition_engine or "auto"
    name = raw.strip().lower()
    if name not in {"opencv", "embedding", "trained", "auto"}:
        logger.warning("Unknown RECOGNITION_ENGINE=%s; using auto", raw)
        return "auto"
    return name


def select_engine(
    requested: str,
    opencv: RecognitionEngine | None = None,
    embedding: RecognitionEngine | None = None,
    trained: RecognitionEngine | None = None,
) -> RecognitionEngine:
    opencv_engine = opencv or OpenCVRecognitionEngine()
    embedding_engine = embedding if embedding is not None else EmbeddingRecognitionEngine()
    trained_engine = trained if trained is not None else TrainedCoatEngine()

    if requested == "opencv":
        return opencv_engine

    if requested == "trained":
        if trained_engine.available():
            return trained_engine
        logger.warning("Trained coat engine requested but unavailable; trying embedding/OpenCV")
        if embedding_engine.available():
            return embedding_engine
        return opencv_engine

    if requested == "embedding":
        if embedding_engine.available():
            return embedding_engine
        logger.warning("Embedding engine requested but unavailable; falling back to OpenCV")
        return opencv_engine

    # auto: prefer trained coat model, then ImageNet embeddings, then OpenCV.
    if trained_engine.available():
        return trained_engine
    if embedding_engine.available():
        return embedding_engine
    logger.info("No ML coat model available; using OpenCV recognition")
    return opencv_engine


class RecognitionService:
    def __init__(self, engine: RecognitionEngine) -> None:
        self.engine = engine

    @classmethod
    def from_settings(
        cls,
        settings: Settings | None = None,
        opencv: RecognitionEngine | None = None,
        embedding: RecognitionEngine | None = None,
        trained: RecognitionEngine | None = None,
    ) -> RecognitionService:
        requested = requested_engine_name(settings)
        engine = select_engine(requested, opencv=opencv, embedding=embedding, trained=trained)
        logger.info("Recognition engine: %s (%s)", engine.name, engine.model_version)
        return cls(engine)

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        return self.engine.analyze(image_bytes)

    def rank_candidates(
        self,
        db: Session,
        *,
        identity_embedding: list[float],
        opencv_embedding: list[float],
        species: str,
        side: str,
        limit: int = 5,
        project_id: str | None = None,
    ) -> list[tuple[Individual, float]]:
        if self.engine.stores_coat_embeddings:
            ranked = self._rank_coat_embeddings(
                db, identity_embedding, side, limit, project_id=project_id
            )
            return ranked
        return ranked_candidates(
            db,
            opencv_embedding or identity_embedding,
            species,
            side,
            limit,
            project_id=project_id,
        )

    def store_coat_embedding(
        self,
        db: Session,
        *,
        detection: Detection,
        media: Media | None,
        embedding: list[float],
        individual_id: str | None = None,
    ) -> CoatEmbedding | None:
        if not self.engine.stores_coat_embeddings or not embedding:
            return None
        row = CoatEmbedding(
            media_id=media.id if media else None,
            detection_id=detection.id,
            individual_id=individual_id,
            embedding_json=json.dumps(embedding),
            side=detection.side or "U",
            captured_at=detection.captured_at,
            latitude=detection.latitude,
            longitude=detection.longitude,
            model_name=getattr(self.engine, "model_name", self.engine.name),
            model_version=self.engine.model_version,
        )
        db.add(row)
        return row

    def bind_coat_embeddings(self, db: Session, detection_id: str, individual_id: str | None) -> None:
        rows = db.scalars(select(CoatEmbedding).where(CoatEmbedding.detection_id == detection_id)).all()
        for row in rows:
            row.individual_id = individual_id

    def log_review(
        self,
        db: Session,
        *,
        detection: Detection,
        review_state: str,
        suggested_individual_id: str | None,
        confirmed_individual_id: str | None,
        similarity_score: float | None,
        candidates: list[tuple[Individual, float]] | None,
        actor: User | None,
        media_id: str | None = None,
    ) -> MatchReview:
        suggested = suggested_individual_id
        confirmed = confirmed_individual_id
        was_correct = evaluate_match(review_state, suggested, confirmed)

        snapshot = [
            {"id": ind.id, "code": ind.code, "score": round(score, 4)}
            for ind, score in (candidates or [])[:5]
        ]
        row = MatchReview(
            detection_id=detection.id,
            media_id=media_id,
            engine=self.engine.name,
            model_version=self.engine.model_version,
            review_state=review_state,
            suggested_individual_id=suggested,
            confirmed_individual_id=confirmed,
            similarity_score=round(similarity_score, 4) if similarity_score is not None else None,
            candidate_snapshot_json=json.dumps(snapshot) if snapshot else None,
            was_correct=was_correct,
            actor_id=actor.id if actor else None,
        )
        db.add(row)
        return row

    def gallery_size(self, db: Session, project_id: str | None = None) -> int:
        """Confirmed-identity material the active engine can compare against."""
        if self.engine.stores_coat_embeddings:
            stmt = (
                select(func.count())
                .select_from(CoatEmbedding)
                .join(Individual, CoatEmbedding.individual_id == Individual.id)
                .where(
                    CoatEmbedding.individual_id.is_not(None),
                    CoatEmbedding.model_version == self.engine.model_version,
                )
            )
            if project_id:
                stmt = stmt.where(Individual.project_id == project_id)
            total = db.scalar(stmt)
        else:
            stmt = select(func.count()).select_from(Individual).where(
                or_(
                    Individual.embedding_left_json.is_not(None),
                    Individual.embedding_right_json.is_not(None),
                )
            )
            if project_id:
                stmt = stmt.where(Individual.project_id == project_id)
            total = db.scalar(stmt)
        return int(total or 0)

    def library_status(self, db: Session, project_id: str | None = None) -> MatchLibraryStatus:
        """Explain an empty candidate list instead of letting it read as 'no match'."""
        size = self.gallery_size(db, project_id=project_id)
        if size == 0:
            note = (
                "No comparable photos yet — the match library is still being built. "
                "An empty result here does not mean this is a new individual."
            )
        elif size < GALLERY_WARMUP_PHOTOS:
            note = (
                f"The match library holds only {size} confirmed photo"
                f"{'' if size == 1 else 's'} so far, so suggestions are still thin."
            )
        else:
            note = None
        return MatchLibraryStatus(size=size, ready=note is None, note=note)

    def initial_review_state(self, is_target_species: bool, candidates: list[tuple[Individual, float]]) -> str | None:
        if is_target_species and candidates:
            return REVIEW_POTENTIAL
        return None

    def _rank_coat_embeddings(
        self,
        db: Session,
        query: list[float],
        side: str,
        limit: int,
        project_id: str | None = None,
    ) -> list[tuple[Individual, float]]:
        if not query:
            return []
        stmt = select(CoatEmbedding).where(
            CoatEmbedding.individual_id.is_not(None),
            CoatEmbedding.model_version == self.engine.model_version,
        )
        if project_id:
            stmt = stmt.join(Individual, CoatEmbedding.individual_id == Individual.id).where(
                Individual.project_id == project_id
            )
        rows = db.scalars(stmt).all()
        if not rows:
            return []

        same_side = side in {"L", "R"}
        scored = self._score_coat_rows(rows, query, side, same_side_only=same_side)
        if not scored and same_side:
            scored = self._score_coat_rows(rows, query, side, same_side_only=False)
        grouped = group_candidates_by_individual(scored, limit=limit)
        if not grouped:
            return []
        ids = [individual_id for individual_id, _ in grouped]
        individuals = {
            row.id: row for row in db.scalars(select(Individual).where(Individual.id.in_(ids))).all()
        }
        return [(individuals[iid], score) for iid, score in grouped if iid in individuals]

    def _score_coat_rows(
        self,
        rows: list[CoatEmbedding],
        query: list[float],
        side: str,
        *,
        same_side_only: bool,
    ) -> list[tuple[str | None, float]]:
        scored: list[tuple[str | None, float]] = []
        for row in rows:
            if same_side_only and side in {"L", "R"} and row.side in {"L", "R"} and row.side != side:
                continue
            vec = json.loads(row.embedding_json) if row.embedding_json else []
            scored.append((row.individual_id, cosine(query, vec)))
        return scored


_service: RecognitionService | None = None


def get_recognition_service() -> RecognitionService:
    global _service
    if _service is None:
        from app.services.recognition.train_pipeline import apply_active_engine_overrides

        apply_active_engine_overrides()
        _service = RecognitionService.from_settings()
    return _service


def reset_recognition_service() -> None:
    """Test helper to drop the process-wide singleton."""
    global _service
    _service = None
