"""Fine-tuned coat re-ID engine: ResNet50 backbone + learned projection head.

Load a checkpoint written by `python -m app.train_coat_reid`. Falls back to
unavailable() when torch or the checkpoint path is missing so OpenCV still runs.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.config import get_settings
from app.services.recognition.types import AnalyzeResult
from app.services.vision import analyze_image

logger = logging.getLogger(__name__)


class TrainedCoatEngine:
    """Coat pattern re-ID with a fine-tuned projection on ResNet50 features."""

    name = "trained"
    model_name = "coat-reid"
    stores_coat_embeddings = True

    def __init__(self, checkpoint_path: str | Path | None = None) -> None:
        settings = get_settings()
        raw = checkpoint_path if checkpoint_path is not None else settings.coat_model_path
        text = str(raw or "").strip()
        self._path = Path(text) if text and text not in {".", "./"} else Path()
        self.model_version = "coat-reid-unloaded"
        self._backbone: Any = None
        self._projection: Any = None
        self._preprocess: Any = None
        self._device: Any = None
        self._attempted = False
        self._error: BaseException | None = None
        self._embedding_dim = 256

    def available(self) -> bool:
        if not str(self._path) or str(self._path) in {".", "./"}:
            return False
        if not self._path.exists() or not self._path.is_file():
            return False
        return self._ensure_loaded()

    def analyze(self, image_bytes: bytes) -> AnalyzeResult:
        vision = analyze_image(image_bytes)
        identity: list[float] = []
        try:
            identity = self._embed(image_bytes, vision.animal_box)
        except Exception:
            logger.exception("Trained coat encode failed")
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
        vision = analyze_image(image_bytes)
        if vision.animal_box is None:
            return []
        return self._embed(image_bytes, vision.animal_box)

    def _embed(self, image_bytes: bytes, box: tuple[int, int, int, int] | None) -> list[float]:
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
        if self._backbone is not None and self._projection is not None:
            return True
        if self._attempted:
            return False
        self._attempted = True
        try:
            import torch
            from torchvision.models import ResNet50_Weights, resnet50

            checkpoint = torch.load(self._path, map_location="cpu", weights_only=False)
            version = checkpoint.get("model_version") or "coat-reid-v1"
            self.model_version = str(version)
            self._embedding_dim = int(checkpoint.get("embedding_dim", 256))

            weights = ResNet50_Weights.IMAGENET1K_V2
            model = resnet50(weights=weights)
            backbone = torch.nn.Sequential(*list(model.children())[:-1])
            projection = torch.nn.Sequential(
                torch.nn.Linear(2048, self._embedding_dim),
                torch.nn.ReLU(inplace=True),
                torch.nn.Linear(self._embedding_dim, self._embedding_dim),
            )
            if "projection" in checkpoint:
                projection.load_state_dict(checkpoint["projection"])
            if checkpoint.get("train_backbone") and "backbone" in checkpoint:
                backbone.load_state_dict(checkpoint["backbone"])

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            backbone.eval().to(device)
            projection.eval().to(device)
            self._backbone = backbone
            self._projection = projection
            self._preprocess = weights.transforms()
            self._device = device
            logger.info("Loaded trained coat model %s from %s", self.model_version, self._path)
            return True
        except Exception as exc:
            self._error = exc
            logger.warning("Could not load trained coat model (%s)", exc)
            return False

    def _encode_bgr(self, bgr: np.ndarray) -> list[float]:
        import torch
        from PIL import Image

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = self._preprocess(pil).unsqueeze(0).to(self._device)
        with torch.no_grad():
            feats = self._backbone(tensor).flatten(1)
            vec = self._projection(feats).flatten().float().cpu().numpy()
        norm = float(np.linalg.norm(vec) + 1e-8)
        return (vec / norm).astype(np.float32).tolist()
