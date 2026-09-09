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


def _warm_coat_box(bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """Bounding box of warm coat pixels — helps camera traps with busy vegetation edges."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    warm = cv2.inRange(hsv, (5, 40, 40), (35, 255, 230))
    warm = cv2.morphologyEx(warm, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
    warm = cv2.morphologyEx(warm, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=1)
    contours, _ = cv2.findContours(warm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(contour)
    if area < bgr.shape[0] * bgr.shape[1] * 0.015:
        return None
    x, y, w, h = cv2.boundingRect(contour)
    return (x, y, w, h)


def _merge_boxes(
    a: tuple[int, int, int, int] | None,
    b: tuple[int, int, int, int] | None,
    frame_shape: tuple[int, ...],
) -> tuple[int, int, int, int]:
    """Prefer overlap of edge and coat boxes; fall back to the stronger single signal."""
    h, w = frame_shape[:2]
    fallback = (int(w * 0.15), int(h * 0.15), int(w * 0.7), int(h * 0.7))
    if a is None and b is None:
        return fallback
    if a is None:
        return b or fallback
    if b is None:
        return a
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)
    if x2 > x1 and y2 > y1 and (x2 - x1) * (y2 - y1) >= min(aw * ah, bw * bh) * 0.2:
        return (x1, y1, x2 - x1, y2 - y1)
    # No useful overlap: keep the smaller focused box (usually the animal, not the whole scene).
    if aw * ah <= bw * bh:
        return a
    return b


def _animal_box(bgr: np.ndarray) -> tuple[int, int, int, int]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edge_box = _largest_salient_box(gray)
    coat_box = _warm_coat_box(bgr)
    return _merge_boxes(edge_box, coat_box, bgr.shape)


def _strip_trap_banner(bgr: np.ndarray) -> tuple[np.ndarray, int]:
    """Remove common camera-trap footer bars so OCR chrome does not steal the crop."""
    h, w = bgr.shape[:2]
    if h < 80:
        return bgr, 0
    band = max(28, int(h * 0.07))
    footer = bgr[h - band : h]
    gray = cv2.cvtColor(footer, cv2.COLOR_BGR2GRAY)
    # Footer bars are usually near-black with sparse white glyphs.
    dark_ratio = float(np.mean(gray < 40))
    if dark_ratio >= 0.55:
        return bgr[: h - band], band
    return bgr, 0


def _is_mono_trap(bgr: np.ndarray) -> bool:
    """True for IR / B&W trail cams (very low chroma)."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    return float(np.mean(hsv[:, :, 1])) < 28.0


def _ir_subject_box(bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """IR flash: animal is a bright mid-tone body on near-black night."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # Ignore pure black and the hottest specular flash on rocks.
    mask = cv2.inRange(gray, 55, 235)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8), iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=1)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    h, w = gray.shape
    best = None
    best_area = 0
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = bw * bh
        if area < h * w * 0.02 or area > h * w * 0.85:
            continue
        aspect = bw / max(bh, 1)
        if aspect < 0.35 or aspect > 4.5:
            continue
        if area > best_area:
            best_area = area
            best = (x, y, bw, bh)
    return best


def _dark_animal_box(bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """Melanistic / shadowed cats: dark blob against leaf litter."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (7, 7), 0)
    _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    h, w = gray.shape
    contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(contour)
    if area < h * w * 0.02 or area > h * w * 0.7:
        return None
    x, y, bw, bh = cv2.boundingRect(contour)
    return (x, y, bw, bh)


def _pattern_score_gray(gray: np.ndarray) -> float:
    """Rosette / spot density for IR and desaturated crops."""
    if gray.size == 0:
        return 0.0
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    enclosed = 0
    if hierarchy is not None:
        for i, c in enumerate(contours):
            area = cv2.contourArea(c)
            if 30 < area < 5000 and hierarchy[0][i][3] != -1:
                enclosed += 1
    density = enclosed / max(gray.size / 10000, 1)
    contrast = float(np.std(gray) / 64.0)
    return float(np.clip(0.65 * min(density / 8, 1.0) + 0.35 * min(contrast, 1.0), 0, 1))


def _felid_score(bgr: np.ndarray, *, mono: bool) -> float:
    """Combined color-rosette + IR pattern + dark-silhouette cues."""
    if bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    pattern = _pattern_score_gray(gray)
    if mono:
        # IR: warm coat ratio is meaningless; lean on pattern + body fill.
        body = float(np.mean((gray > 50) & (gray < 230)))
        return float(np.clip(0.75 * pattern + 0.25 * body, 0, 1))
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    warm = cv2.inRange(hsv, (5, 40, 40), (35, 255, 230))
    warm_ratio = float(np.count_nonzero(warm)) / warm.size
    color_score = float(np.clip(0.45 * warm_ratio + 0.55 * pattern, 0, 1))
    # Melanistic: low warm ratio but dark coherent body + residual ghost spots.
    dark_ratio = float(np.mean(gray < 60))
    if dark_ratio > 0.35 and warm_ratio < 0.12:
        melanistic = float(np.clip(0.4 * dark_ratio + 0.6 * pattern, 0, 1))
        return max(color_score, melanistic)
    return color_score


def _candidate_boxes(bgr: np.ndarray, *, mono: bool) -> list[tuple[int, int, int, int]]:
    """Generate localization hypotheses; scoring picks the best crop."""
    h, w = bgr.shape[:2]
    center = (int(w * 0.15), int(h * 0.15), int(w * 0.7), int(h * 0.7))
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    boxes: list[tuple[int, int, int, int] | None] = [
        _animal_box(bgr),
        _largest_salient_box(gray),
        _warm_coat_box(bgr) if not mono else None,
        _ir_subject_box(bgr) if mono else None,
        _dark_animal_box(bgr),
        center,
    ]
    unique: list[tuple[int, int, int, int]] = []
    for box in boxes:
        if box is None:
            continue
        if box not in unique:
            unique.append(box)
    return unique or [center]


def _rosette_score(bgr: np.ndarray) -> float:
    """Backward-compatible alias used by tests and callers."""
    return _felid_score(bgr, mono=_is_mono_trap(bgr))


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

    frame, banner = _strip_trap_banner(bgr)
    mono = _is_mono_trap(frame)
    best_box: tuple[int, int, int, int] | None = None
    best_score = -1.0
    best_crop: np.ndarray | None = None
    for box in _candidate_boxes(frame, mono=mono):
        x, y, w, h = box
        crop = frame[y : y + h, x : x + w]
        if crop.size == 0:
            continue
        score = _felid_score(crop, mono=mono)
        if score > best_score:
            best_score = score
            best_box = box
            best_crop = crop

    if best_box is None or best_crop is None:
        return DetectionResult(False, "unreadable", 0.0, "Could not locate animal region", [], None)

    score = best_score
    is_jaguar = score >= 0.38
    if is_jaguar:
        label = "jaguar"
        mode = "IR trail-cam" if mono else "color"
        summary = (
            f"Spotted felid pattern detected ({mode}, confidence {score:.0%}). "
            "Coat fingerprint extracted for individual matching."
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
            f"No strong jaguar coat pattern ({score:.0%}). "
            "Empty frames, prey, or other wildlife are common on camera traps."
        )
    return DetectionResult(
        is_jaguar=is_jaguar,
        species_label=label,
        confidence=round(score, 4),
        summary=summary,
        embedding=_embedding(best_crop),
        animal_box=best_box,
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
