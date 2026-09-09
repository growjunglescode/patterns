"""Jaguar detection and individual matching.

Camera-trap photos are scored for spotted-felid (jaguar) texture, then a
rosette fingerprint is extracted from the animal region. That fingerprint is
compared to named individuals.

Identity matching is orchestrated by RecognitionService:
- OpenCVRecognitionEngine (this module) is the fallback fingerprint.
- EmbeddingRecognitionEngine uses a pretrained ResNet50 for similarity testing.

This file stays as the OpenCV implementation so it can always be used if the
ML model cannot load.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class DetectionResult:
    is_jaguar: bool
    species_label: str
    confidence: float
    summary: str
    embedding: list[float]
    animal_box: tuple[int, int, int, int] | None


def _largest_salient_box(gray: np.ndarray) -> tuple[int, int, int, int] | None:
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    edges = cv2.Canny(blurred, 40, 120)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        h, w = gray.shape
        return (int(w * 0.15), int(h * 0.15), int(w * 0.7), int(h * 0.7))
    contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(contour)
    if w * h < gray.size * 0.02:
        gh, gw = gray.shape
        return (int(gw * 0.15), int(gh * 0.15), int(gw * 0.7), int(gh * 0.7))
    return (x, y, w, h)


def _rosette_score(bgr: np.ndarray) -> float:
    """High score when the crop has jaguar-like enclosed dark spots on a warm coat."""
    if bgr.size == 0:
        return 0.0
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    warm = cv2.inRange(hsv, (5, 40, 40), (35, 255, 230))
    warm_ratio = float(np.count_nonzero(warm)) / warm.size
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    enclosed = 0
    if hierarchy is not None:
        for i, c in enumerate(contours):
            area = cv2.contourArea(c)
            if 40 < area < 4000 and hierarchy[0][i][3] != -1:
                enclosed += 1
    density = enclosed / max(gray.size / 10000, 1)
    return float(np.clip(0.45 * warm_ratio + 0.55 * min(density / 8, 1.0), 0, 1))


def _embedding(bgr: np.ndarray) -> list[float]:
    """Compact texture + color fingerprint of the coat (rosette identity proxy)."""
    crop = cv2.resize(bgr, (128, 128), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist_h = cv2.calcHist([hsv], [0], None, [16], [0, 180]).flatten()
    hist_s = cv2.calcHist([hsv], [1], None, [8], [0, 256]).flatten()
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    mag_hist = np.histogram(mag, bins=16, range=(0, 255))[0].astype(np.float32)
    small = cv2.resize(gray, (8, 8)).flatten().astype(np.float32)
    vec = np.concatenate([hist_h, hist_s, mag_hist, small])
    norm = np.linalg.norm(vec) + 1e-8
    return (vec / norm).astype(np.float32).tolist()


def cosine(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb) + 1e-8)
    return float(np.dot(va, vb) / denom)


def analyze_image(image_bytes: bytes) -> DetectionResult:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if bgr is None:
        return DetectionResult(False, "unreadable", 0.0, "Could not decode image", [], None)

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    box = _largest_salient_box(gray)
    x, y, w, h = box
    crop = bgr[y : y + h, x : x + w]
    score = _rosette_score(crop)
    is_jaguar = score >= 0.38
    if is_jaguar:
        label = "jaguar"
        summary = (
            f"Spotted felid pattern detected (confidence {score:.0%}). "
            "Rosette fingerprint extracted for individual matching."
        )
    elif score >= 0.22:
        label = "possible_felid"
        summary = (
            f"Possible spotted cat, not confidently a jaguar ({score:.0%}). "
            "You can still name an individual if you confirm it."
        )
    else:
        label = "other_or_empty"
        summary = (
            f"No strong jaguar rosette pattern ({score:.0%}). "
            "Empty frames, prey, or other wildlife are common on camera traps."
        )
    return DetectionResult(
        is_jaguar=is_jaguar,
        species_label=label,
        confidence=round(score, 4),
        summary=summary,
        embedding=_embedding(crop),
        animal_box=box,
    )


def best_frame_from_video(video_bytes: bytes, max_frames: int = 24) -> tuple[bytes, DetectionResult] | None:
    path = "/tmp/patterns_video.mp4"
    with open(path, "wb") as handle:
        handle.write(video_bytes)
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(frame_count // max_frames, 1) if frame_count else 8
    best: tuple[bytes, DetectionResult] | None = None
    index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if index % step != 0:
            index += 1
            continue
        ok_enc, buf = cv2.imencode(".jpg", frame)
        if not ok_enc:
            index += 1
            continue
        raw = buf.tobytes()
        result = analyze_image(raw)
        if best is None or result.confidence > best[1].confidence:
            best = (raw, result)
        index += 1
        if index > frame_count and frame_count:
            break
    cap.release()
    return best
