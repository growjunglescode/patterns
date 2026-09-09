"""Pretrained ResNet50 embeddings for coat similarity (no jaguar-specific training)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import cv2
import numpy as np

from app.services.recognition.types import AnalyzeResult
from app.services.vision import analyze_image

logger = logging.getLogger(__name__)

EncoderFn = Callable[[bytes], list[float]]


class EmbeddingRecognitionEngine:
    """ImageNet ResNet50 (torchvision) as a 2048-d embedding extractor.

    Chosen because it installs with torch/torchvision on Windows, runs on CPU,
    and does not require a custom jaguar dataset. This is similarity testing
    only — not a trained re-ID model.
    """

    name = "embedding"
    model_name = "resnet50"
    model_version = "resnet50-IMAGENET1K_V2"
    stores_coat_embeddings = True

    def __init__(self, encoder: EncoderFn | None = None) -> None:
        self._encoder = encoder
        self._model: Any = None
        self._preprocess: Any = None
        self._device: Any = None
        self._attempted = encoder is not None
        self._error: BaseException | None = None

    def available(self) -> bool:
        if self._encoder is not None:
            return True
        return self._ensure_loaded()

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        vision = analyze_image(image_bytes)
        identity: list[float] = []
        try:
            identity = self._embed(image_bytes, vision.animal_box)
        except Exception:
            logger.exception("Embedding encode failed; identity vector left empty")
            identity = []
        return AnalyzeResult(
            is_jaguar=vision.is_jaguar,
            species_label=vision.species_label,
            confidence=vision.confidence,
            summary=vision.summary,
            identity_embedding=identity,
            opencv_embedding=list(vision.embedding),
            animal_box=vision.animal_box,
            engine=self.name,
            model_version=self.model_version,
        )

    def encode_gallery_image(self, image_bytes: bytes) -> list[float]:
        """Encode one already-identified photo for the match library.

        Uses the same animal crop as `analyze`, so backfilled vectors are
        comparable to the ones produced at upload time. Returns an empty list
        when the file cannot be decoded, so callers never store a partial
        vector.
        """
        vision = analyze_image(image_bytes)
        if vision.animal_box is None:
            return []
        return self._embed(image_bytes, vision.animal_box)

    def _embed(self, image_bytes: bytes, box: tuple[int, int, int, int] | None) -> list[float]:
        if self._encoder is not None:
            return list(self._encoder(image_bytes))
        if not self._ensure_loaded():
            return []
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if bgr is None:
            return []
        crop = bgr
        if box:
            x, y, w, h = box
            crop = bgr[y : y + h, x : x + w]
            if crop.size == 0:
                crop = bgr
        return self._encode_bgr(crop)

    def _ensure_loaded(self) -> bool:
        if self._model is not None:
            return True
        if self._attempted:
            return False
        self._attempted = True
        try:
            import torch
            from torchvision.models import ResNet50_Weights, resnet50

            weights = ResNet50_Weights.IMAGENET1K_V2
            model = resnet50(weights=weights)
            model.eval()
            # Drop the ImageNet classifier; keep avg-pool features (2048-d).
            backbone = torch.nn.Sequential(*list(model.children())[:-1])
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            backbone.to(device)
            self._model = backbone
            self._preprocess = weights.transforms()
            self._device = device
            logger.info("Loaded %s on %s", self.model_version, device)
            return True
        except Exception as exc:
            self._error = exc
            logger.warning(
                "Could not load pretrained ResNet50 (%s). OpenCV fallback will be used.",
                exc,
            )
            return False

    def _encode_bgr(self, bgr: np.ndarray) -> list[float]:
        import torch
        from PIL import Image

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = self._preprocess(pil).unsqueeze(0).to(self._device)
        with torch.no_grad():
            feats = self._model(tensor)
            vec = feats.flatten().float().cpu().numpy()
        norm = float(np.linalg.norm(vec) + 1e-8)
        return (vec / norm).astype(np.float32).tolist()
