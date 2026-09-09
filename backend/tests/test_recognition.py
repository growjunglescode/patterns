"""RecognitionService, ranking, and engine-selection tests.

Torch is mocked via an injected encoder so CI does not download weights or need a GPU.
"""

from __future__ import annotations

import cv2
import numpy as np

from app.services.recognition import (
    REVIEW_CONFIRMED,
    REVIEW_NEW,
    REVIEW_POTENTIAL,
    REVIEW_REJECTED,
    RecognitionService,
    cosine,
    evaluate_match,
    group_candidates_by_individual,
    select_engine,
)
from app.services.recognition.embedding_engine import EmbeddingRecognitionEngine
from app.services.recognition.opencv_engine import OpenCVRecognitionEngine
from app.services.recognition.types import AnalyzeResult


def _jpeg(bgr=(28, 95, 190)) -> bytes:
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    image[:] = bgr
    ok, buf = cv2.imencode(".jpg", image)
    assert ok
    return buf.tobytes()


class _DeadEmbedding:
    name = "embedding"
    model_version = "dead"
    stores_coat_embeddings = True

    def available(self) -> bool:
        return False

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        raise AssertionError("dead engine should not analyze")


class _FakeEmbedding:
    name = "embedding"
    model_version = "fake-resnet"
    model_name = "fake"
    stores_coat_embeddings = True

    def available(self) -> bool:
        return True

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        vec = [float(len(image_bytes) % 7), 1.0, 0.0]
        return AnalyzeResult(
            is_jaguar=True,
            species_label="jaguar",
            confidence=0.9,
            summary="fake",
            identity_embedding=vec,
            opencv_embedding=[1.0, 0.0],
            animal_box=None,
            engine=self.name,
            model_version=self.model_version,
        )


def test_cosine_ranks_identical_vectors_highest():
    query = [1.0, 0.0, 0.0]
    same = cosine(query, [1.0, 0.0, 0.0])
    close = cosine(query, [0.9, 0.1, 0.0])
    far = cosine(query, [0.0, 1.0, 0.0])
    assert same > 0.99
    assert same > close > far


def test_cosine_mismatched_length_is_zero():
    assert cosine([1.0, 0.0], [1.0]) == 0.0
    assert cosine([], [1.0]) == 0.0


def test_group_candidates_by_individual_takes_max_and_top_five():
    rows = [
        ("jag-a", 0.40),
        ("jag-a", 0.91),
        ("jag-b", 0.80),
        ("jag-c", 0.70),
        ("jag-d", 0.60),
        ("jag-e", 0.50),
        ("jag-f", 0.49),
        (None, 0.99),
    ]
    grouped = group_candidates_by_individual(rows, limit=5)
    assert [item[0] for item in grouped] == ["jag-a", "jag-b", "jag-c", "jag-d", "jag-e"]
    assert grouped[0][1] == 0.91
    assert "jag-f" not in {item[0] for item in grouped}


def test_evaluate_match_labels_correct_and_incorrect():
    assert evaluate_match(REVIEW_CONFIRMED, "a", "a") is True
    assert evaluate_match(REVIEW_CONFIRMED, "a", "b") is False
    assert evaluate_match(REVIEW_REJECTED, "a", None) is False
    assert evaluate_match(REVIEW_NEW, "a", "new") is False
    assert evaluate_match(REVIEW_POTENTIAL, "a", None) is None
    assert evaluate_match(REVIEW_NEW, None, "new") is None


def test_select_engine_auto_falls_back_when_embedding_unavailable():
    engine = select_engine(
        "auto",
        opencv=OpenCVRecognitionEngine(),
        embedding=_DeadEmbedding(),
        trained=_DeadEmbedding(),
    )
    assert engine.name == "opencv"


def test_select_engine_embedding_falls_back_when_model_missing():
    engine = select_engine("embedding", opencv=OpenCVRecognitionEngine(), embedding=_DeadEmbedding())
    assert engine.name == "opencv"


def test_select_engine_prefers_trained_when_available():
    class _Trained(_FakeEmbedding):
        name = "trained"
        model_version = "coat-reid-test"

    engine = select_engine(
        "auto",
        opencv=OpenCVRecognitionEngine(),
        embedding=_FakeEmbedding(),
        trained=_Trained(),
    )
    assert engine.name == "trained"


def test_select_engine_opencv_never_touches_embedding():
    engine = select_engine("opencv", opencv=OpenCVRecognitionEngine(), embedding=_DeadEmbedding())
    assert engine.name == "opencv"


def test_select_engine_auto_prefers_embedding_when_available():
    engine = select_engine(
        "auto",
        opencv=OpenCVRecognitionEngine(),
        embedding=_FakeEmbedding(),
        trained=_DeadEmbedding(),
    )
    assert engine.name == "embedding"


def test_recognition_service_never_auto_declares_identity():
    service = RecognitionService(_FakeEmbedding())
    result = service.analyze(_jpeg())
    assert not hasattr(result, "individual_id") or getattr(result, "individual_id", None) is None
    assert service.initial_review_state(True, [("ind", 0.99)]) == REVIEW_POTENTIAL
    assert service.initial_review_state(True, [("ind", 0.99)]) != REVIEW_CONFIRMED
    assert service.initial_review_state(True, []) is None


def test_opencv_engine_returns_fingerprint():
    engine = OpenCVRecognitionEngine()
    result = engine.analyze(_jpeg())
    assert engine.available()
    assert result.engine == "opencv"
    assert result.opencv_embedding
    assert result.identity_embedding == result.opencv_embedding
    assert not engine.stores_coat_embeddings


def test_embedding_engine_uses_injected_encoder_without_torch():
    def fake_encoder(_data: bytes) -> list[float]:
        return [0.0, 1.0, 0.0]

    engine = EmbeddingRecognitionEngine(encoder=fake_encoder)
    assert engine.available()
    result = engine.analyze(_jpeg())
    assert result.engine == "embedding"
    assert result.identity_embedding == [0.0, 1.0, 0.0]
    assert result.opencv_embedding  # OpenCV fingerprint still produced
    assert result.identity_embedding != result.opencv_embedding
    assert engine.stores_coat_embeddings


def test_embedding_engine_degrades_when_load_fails():
    engine = EmbeddingRecognitionEngine()
    engine._attempted = True
    engine._model = None
    assert engine.available() is False
    result = engine.analyze(_jpeg())
    assert result.identity_embedding == []
    assert result.opencv_embedding  # species/fingerprint path still works
