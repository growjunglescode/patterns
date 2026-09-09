"""Cosine similarity and per-jaguar grouping — no model or database required."""

from __future__ import annotations

import numpy as np


def evaluate_match(
    review_state: str,
    suggested_id: str | None,
    confirmed_id: str | None,
) -> bool | None:
    """Label a human decision for later scoring of the engine.

    True = the engine's suggestion matched what the reviewer confirmed.
    False = the reviewer rejected the suggestion or confirmed a different cat.
    None = no suggestion, or the review is still pending.
    """
    if review_state == "confirmed_match" and suggested_id and confirmed_id:
        return suggested_id == confirmed_id
    if review_state in {"rejected_match", "new_jaguar"} and suggested_id:
        return False
    if review_state == "awaiting_second_review" and suggested_id and confirmed_id:
        return suggested_id == confirmed_id
    return None


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb) + 1e-8)
    return float(np.dot(va, vb) / denom)


def group_candidates_by_individual(
    scored_rows: list[tuple[str | None, float]],
    limit: int = 5,
) -> list[tuple[str, float]]:
    """Keep the highest similarity per jaguar, then return the top `limit`.

    Rows with a missing individual id are ignored — unconfirmed photos are not
    treated as a named cat.
    """
    best: dict[str, float] = {}
    for individual_id, score in scored_rows:
        if not individual_id:
            continue
        previous = best.get(individual_id)
        if previous is None or score > previous:
            best[individual_id] = score
    ranked = sorted(best.items(), key=lambda item: item[1], reverse=True)
    return ranked[:limit]
