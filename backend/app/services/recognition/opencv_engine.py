"""OpenCV coat fingerprint engine — the current production fallback."""

from __future__ import annotations

from app.services.recognition.types import AnalyzeResult
from app.services.vision import analyze_image


class OpenCVRecognitionEngine:
    """Wraps the existing Canny-crop + HSV/blob + histogram fingerprint."""

    name = "opencv"
    model_version = "opencv-rosette-v1"
    stores_coat_embeddings = False

    def available(self) -> bool:
        return True

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        result = analyze_image(image_bytes)
        return AnalyzeResult(
            is_jaguar=result.is_jaguar,
            species_label=result.species_label,
            confidence=result.confidence,
            summary=result.summary,
            identity_embedding=list(result.embedding),
            opencv_embedding=list(result.embedding),
            animal_box=result.animal_box,
            engine=self.name,
            model_version=self.model_version,
        )
