"""Vision localization helpers for animal crops."""

from __future__ import annotations

import cv2
import numpy as np

from app.services.vision import _merge_boxes, _warm_coat_box, analyze_image


def test_merge_boxes_uses_overlap_when_present():
    a = (10, 10, 100, 100)
    b = (40, 40, 100, 100)
    merged = _merge_boxes(a, b, (200, 200, 3))
    assert merged == (40, 40, 70, 70)


def test_analyze_image_returns_box_and_embedding():
    image = np.zeros((160, 160, 3), dtype=np.uint8)
    image[:] = (20, 90, 180)
    # Dark blobs on warm field to excite rosette heuristic a bit.
    cv2.circle(image, (80, 80), 12, (10, 10, 10), -1)
    cv2.circle(image, (110, 70), 10, (10, 10, 10), -1)
    ok, buf = cv2.imencode(".jpg", image)
    assert ok
    result = analyze_image(buf.tobytes())
    assert result.animal_box is not None
    assert len(result.embedding) > 0
    assert result.species_label in {"jaguar", "possible_felid", "other_or_empty"}


def test_warm_coat_box_finds_warm_region():
    image = np.zeros((120, 120, 3), dtype=np.uint8)
    image[30:90, 30:90] = (30, 120, 200)  # BGR warm-ish
    box = _warm_coat_box(image)
    assert box is not None
