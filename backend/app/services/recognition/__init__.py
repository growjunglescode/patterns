"""Jaguar recognition: swap OpenCV fingerprints for pretrained embeddings."""

from app.services.recognition.ranking import cosine, evaluate_match, group_candidates_by_individual
from app.services.recognition.service import (
    RecognitionService,
    get_recognition_service,
    reset_recognition_service,
    select_engine,
)
from app.services.recognition.types import (
    GALLERY_WARMUP_PHOTOS,
    REVIEW_AWAITING_SECOND,
    REVIEW_CONFIRMED,
    REVIEW_NEW,
    REVIEW_POTENTIAL,
    REVIEW_REJECTED,
    AnalyzeResult,
    MatchLibraryStatus,
)

__all__ = [
    "AnalyzeResult",
    "GALLERY_WARMUP_PHOTOS",
    "MatchLibraryStatus",
    "RecognitionService",
    "REVIEW_AWAITING_SECOND",
    "REVIEW_CONFIRMED",
    "REVIEW_NEW",
    "REVIEW_POTENTIAL",
    "REVIEW_REJECTED",
    "cosine",
    "evaluate_match",
    "get_recognition_service",
    "group_candidates_by_individual",
    "reset_recognition_service",
    "select_engine",
]
