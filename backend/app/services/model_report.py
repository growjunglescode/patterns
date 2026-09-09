"""Model report card: what the recognition engines actually got right.

Read-only. Nothing here changes matching, thresholds, or identity assignment —
it only reads `match_reviews` rows that the recognition service already writes.

Two datasets come out of the same rows, because they answer different questions:

1. *Decisions* — one row per human decision. Tells you how often a suggestion the
   engine actually surfaced was accepted or rejected.
2. *Detections* — one row per photo that has both a recorded candidate list and a
   final human decision. Tells you top-1 / top-5 accuracy across the whole score
   range, including scores below the suggestion threshold that a reviewer never saw.

Everything is measured against human confirmations, so it is agreement with
reviewers, not ground truth. That caveat travels with the numbers in ACCURACY_BASIS.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from app.services.recognition.types import (
    REVIEW_CONFIRMED,
    REVIEW_NEW,
    REVIEW_POTENTIAL,
    REVIEW_REJECTED,
)

# Below this many decided reviews we publish counts only. A percentage from a
# handful of reviews reads as a claim and is not one.
MIN_REVIEWS_FOR_ACCURACY = 30

# Same idea per score bucket, at a smaller scale: a bucket needs this many
# decisions before its accuracy is worth printing as a percentage.
MIN_BUCKET_REVIEWS = 10

BUCKET_WIDTH = 0.1

TERMINAL_STATES = frozenset({REVIEW_CONFIRMED, REVIEW_REJECTED, REVIEW_NEW})

ACCURACY_BASIS = (
    "Accuracy here means agreement with human reviewers, not ground truth. A "
    "\"correct\" match is one where a reviewer confirmed the individual the engine "
    "put at the top. If reviewers are wrong, this page is wrong in the same direction."
)

SMALL_SAMPLE_NOTE = (
    f"Percentages appear once at least {MIN_REVIEWS_FOR_ACCURACY} decisions have been "
    "recorded. Below that, only raw counts are shown, because an accuracy figure from "
    "a handful of reviews says more about luck than about the model."
)

TOP_K_NOTE = (
    "Top-1 and top-5 are measured on photos where the engine recorded a candidate "
    "list and a reviewer later reached a decision. A rejected match counts as a "
    "top-1 miss but is left out of top-5, because rejecting the leading suggestion "
    "does not tell us whether the right animal was further down the list. A photo "
    "logged as a new jaguar counts as a miss in both, since the correct answer was "
    "not in the catalogue at the time."
)

ENGINE_LABELS = {
    "opencv": "OpenCV (fallback)",
    "embedding": "ML embeddings (ResNet50)",
}


def engine_label(name: str | None) -> str:
    if not name:
        return "Unknown engine"
    return ENGINE_LABELS.get(name, name)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def parse_snapshot(raw: str | None) -> list[dict]:
    """Candidate list stored at match time: [{id, code, score}, ...], best first."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict) and item.get("id")]


def _percent(hits: int, total: int, minimum: int) -> float | None:
    if total < minimum or total == 0:
        return None
    return round(100 * hits / total, 1)


# --------------------------------------------------------------------------- #
# Dataset 1: one row per human decision
# --------------------------------------------------------------------------- #


def decision_counts(rows: list) -> dict:
    """Accept / reject / pending tallies over MatchReview rows."""
    decided = [row for row in rows if row.was_correct is not None]
    accepted = [row for row in decided if row.was_correct]
    pending = [
        row
        for row in rows
        if row.was_correct is None and row.review_state == REVIEW_POTENTIAL
    ]
    no_suggestion = [
        row
        for row in rows
        if row.was_correct is None and row.review_state != REVIEW_POTENTIAL
    ]
    return {
        "total_reviews": len(rows),
        "decided": len(decided),
        "accepted": len(accepted),
        "rejected": len(decided) - len(accepted),
        "awaiting_review": len(pending),
        "no_suggestion_to_judge": len(no_suggestion),
        "confirmed_matches": sum(1 for row in rows if row.review_state == REVIEW_CONFIRMED),
        "rejected_matches": sum(1 for row in rows if row.review_state == REVIEW_REJECTED),
        "new_jaguars": sum(1 for row in rows if row.review_state == REVIEW_NEW),
    }


# --------------------------------------------------------------------------- #
# Dataset 2: one row per photo with a candidate list and a final decision
# --------------------------------------------------------------------------- #


def detection_outcomes(rows: list) -> list[dict]:
    """Collapse review rows into one outcome per detection.

    The candidate list is written at upload time and the decision arrives later on a
    separate row, so both have to be stitched back together per detection.
    """
    by_detection: dict[str, list] = defaultdict(list)
    for row in rows:
        by_detection[row.detection_id].append(row)

    outcomes: list[dict] = []
    for detection_id, group in by_detection.items():
        ordered = sorted(group, key=lambda row: (_aware(row.created_at) or datetime.min.replace(tzinfo=timezone.utc)))
        snapshot: list[dict] = []
        for row in ordered:
            candidates = parse_snapshot(row.candidate_snapshot_json)
            if len(candidates) > len(snapshot):
                snapshot = candidates
        terminal = next(
            (row for row in reversed(ordered) if row.review_state in TERMINAL_STATES),
            None,
        )
        if not snapshot or terminal is None:
            continue

        state = terminal.review_state
        truth = terminal.confirmed_individual_id if state in {REVIEW_CONFIRMED, REVIEW_NEW} else None
        top = snapshot[0]
        top_ids = [item["id"] for item in snapshot[:5]]
        outcomes.append(
            {
                "detection_id": detection_id,
                "engine": terminal.engine,
                "model_version": terminal.model_version,
                "review_state": state,
                "top_score": top.get("score"),
                "top1_hit": bool(truth is not None and top["id"] == truth),
                # Rejected: the leading suggestion was wrong, but the reviewer never
                # told us whether the right cat sat lower in the list.
                "top5_known": state != REVIEW_REJECTED,
                "top5_hit": bool(truth is not None and truth in top_ids),
                "candidate_count": len(snapshot),
            }
        )
    return outcomes


def top_k_accuracy(outcomes: list[dict]) -> dict:
    top1_total = len(outcomes)
    top1_hits = sum(1 for row in outcomes if row["top1_hit"])
    top5_pool = [row for row in outcomes if row["top5_known"]]
    top5_hits = sum(1 for row in top5_pool if row["top5_hit"])
    return {
        "top1": {
            "evaluated": top1_total,
            "hits": top1_hits,
            "percent": _percent(top1_hits, top1_total, MIN_REVIEWS_FOR_ACCURACY),
        },
        "top5": {
            "evaluated": len(top5_pool),
            "hits": top5_hits,
            "percent": _percent(top5_hits, len(top5_pool), MIN_REVIEWS_FOR_ACCURACY),
            "undetermined": top1_total - len(top5_pool),
        },
        "note": TOP_K_NOTE,
    }


# --------------------------------------------------------------------------- #
# Combined stats block, reused for overall / per engine / per model version
# --------------------------------------------------------------------------- #


def stats_block(rows: list, outcomes: list[dict] | None = None) -> dict:
    """Everything measurable about one slice of reviews, with suppression applied."""
    counts = decision_counts(rows)
    resolved = outcomes if outcomes is not None else detection_outcomes(rows)
    decided = counts["decided"]
    accuracy = _percent(counts["accepted"], decided, MIN_REVIEWS_FOR_ACCURACY)
    return {
        **counts,
        "sample_size": decided,
        "accuracy_percent": accuracy,
        "accuracy_available": accuracy is not None,
        "minimum_for_percent": MIN_REVIEWS_FOR_ACCURACY,
        "shortfall": max(0, MIN_REVIEWS_FOR_ACCURACY - decided),
        **top_k_accuracy(resolved),
    }


def _slice(rows: list, key) -> dict[str, list]:
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        grouped[key(row)].append(row)
    return grouped


def engine_breakdown(rows: list) -> list[dict]:
    """Head-to-head stats per engine, so OpenCV and ML can be compared directly."""
    grouped = _slice(rows, lambda row: row.engine or "unknown")
    out = []
    for name, group in grouped.items():
        out.append(
            {
                "engine": name,
                "engine_label": engine_label(name),
                "model_versions": sorted({row.model_version for row in group if row.model_version}),
                **stats_block(group),
            }
        )
    out.sort(key=lambda item: (-item["total_reviews"], item["engine"]))
    return out


def model_version_breakdown(rows: list) -> list[dict]:
    grouped = _slice(rows, lambda row: f"{row.engine or 'unknown'}||{row.model_version or 'unknown'}")
    out = []
    for compound, group in grouped.items():
        name, version = compound.split("||", 1)
        out.append(
            {
                "engine": name,
                "engine_label": engine_label(name),
                "model_version": version,
                **stats_block(group),
            }
        )
    out.sort(key=lambda item: (-item["total_reviews"], item["engine"], item["model_version"]))
    return out


# --------------------------------------------------------------------------- #
# Score distribution — the part that says whether 0.68 / 0.82 are sane
# --------------------------------------------------------------------------- #


def bucket_index(score: float) -> int:
    return min(9, max(0, int(score * 10)))


def bucket_label(index: int) -> str:
    return f"{index / 10:.1f}–{(index + 1) / 10:.1f}"


def score_buckets(outcomes: list[dict]) -> list[dict]:
    """Top-1 accuracy grouped into 0.1-wide similarity bands.

    Only bands that actually contain photos are returned; an empty band is drawn as
    nothing rather than as a zero-height bar that reads like a measured result.
    """
    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in outcomes:
        score = row.get("top_score")
        if score is None:
            continue
        grouped[bucket_index(float(score))].append(row)

    buckets = []
    for index in sorted(grouped):
        group = grouped[index]
        hits = sum(1 for row in group if row["top1_hit"])
        buckets.append(
            {
                "index": index,
                "label": bucket_label(index),
                "range_low": round(index / 10, 1),
                "range_high": round((index + 1) / 10, 1),
                "evaluated": len(group),
                "correct": hits,
                "incorrect": len(group) - hits,
                "accuracy_percent": _percent(hits, len(group), MIN_BUCKET_REVIEWS),
                "enough_to_judge": len(group) >= MIN_BUCKET_REVIEWS,
                "minimum_for_percent": MIN_BUCKET_REVIEWS,
            }
        )
    return buckets


def band_stats(outcomes: list[dict], low: float | None, high: float | None) -> dict:
    """Top-1 accuracy for scores in [low, high)."""
    pool = []
    for row in outcomes:
        score = row.get("top_score")
        if score is None:
            continue
        score = float(score)
        if low is not None and score < low:
            continue
        if high is not None and score >= high:
            continue
        pool.append(row)
    hits = sum(1 for row in pool if row["top1_hit"])
    return {
        "evaluated": len(pool),
        "correct": hits,
        "accuracy_percent": _percent(hits, len(pool), MIN_BUCKET_REVIEWS),
    }


def threshold_reading(
    outcomes: list[dict],
    suggest_threshold: float,
    confirm_threshold: float,
) -> dict:
    """Plain-English reading of what the distribution implies about the thresholds.

    Says nothing at all when the evidence is thin. No interpolation, no projection.
    """
    scored = [row for row in outcomes if row.get("top_score") is not None]
    below = band_stats(outcomes, None, suggest_threshold)
    middle = band_stats(outcomes, suggest_threshold, confirm_threshold)
    above = band_stats(outcomes, confirm_threshold, None)

    bands = [
        {"label": f"Below {suggest_threshold:.2f} (never suggested)", **below},
        {"label": f"{suggest_threshold:.2f} to {confirm_threshold:.2f} (suggested for review)", **middle},
        {"label": f"{confirm_threshold:.2f} and above (treated as a strong match)", **above},
    ]

    if len(scored) < MIN_REVIEWS_FOR_ACCURACY:
        return {
            "sufficient": False,
            "evaluated": len(scored),
            "bands": bands,
            "sentences": [
                f"There are {len(scored)} scored photo"
                f"{'' if len(scored) == 1 else 's'} with a human decision behind them. "
                f"That is not enough to say whether {suggest_threshold:.2f} and "
                f"{confirm_threshold:.2f} are set in the right place, so this page does "
                "not guess.",
                f"Roughly {MIN_REVIEWS_FOR_ACCURACY} decided photos would be a sensible "
                "minimum before reading anything into the shape of this chart.",
            ],
        }

    sentences: list[str] = []
    if above["accuracy_percent"] is not None:
        sentences.append(
            f"Above {confirm_threshold:.2f}, {above['correct']} of {above['evaluated']} "
            f"top suggestions were the individual a reviewer confirmed "
            f"({above['accuracy_percent']}%). A high figure here means the strong-match "
            f"line is not letting bad matches through; a low one means "
            f"{confirm_threshold:.2f} is too generous."
        )
    else:
        sentences.append(
            f"Only {above['evaluated']} decided photo"
            f"{'' if above['evaluated'] == 1 else 's'} scored above {confirm_threshold:.2f}, "
            "which is too few to judge that line."
        )

    if middle["accuracy_percent"] is not None:
        sentences.append(
            f"Between {suggest_threshold:.2f} and {confirm_threshold:.2f}, "
            f"{middle['correct']} of {middle['evaluated']} were right "
            f"({middle['accuracy_percent']}%). This is the band a human is meant to "
            "arbitrate, so a middling figure here is expected and healthy."
        )
    else:
        sentences.append(
            f"Only {middle['evaluated']} decided photo"
            f"{'' if middle['evaluated'] == 1 else 's'} landed between "
            f"{suggest_threshold:.2f} and {confirm_threshold:.2f}."
        )

    if below["accuracy_percent"] is not None:
        sentences.append(
            f"Below {suggest_threshold:.2f}, {below['correct']} of {below['evaluated']} "
            f"leading candidates still turned out to be the right animal "
            f"({below['accuracy_percent']}%). Correct matches sitting below the "
            f"suggestion line are the argument for lowering {suggest_threshold:.2f}."
        )
    else:
        sentences.append(
            f"Below {suggest_threshold:.2f} there are {below['evaluated']} decided "
            "photos. Scores under the suggestion line are rarely shown to a reviewer, "
            "so this part of the range stays sparse by design — worth remembering "
            "before concluding the line is set correctly."
        )

    return {
        "sufficient": True,
        "evaluated": len(scored),
        "bands": bands,
        "sentences": sentences,
    }


def engine_comparison_note(breakdown: list[dict]) -> str:
    """One honest sentence about whether the engines can be compared yet."""
    comparable = [row for row in breakdown if row["accuracy_available"]]
    if len(comparable) < 2:
        measured = ", ".join(
            f"{row['engine_label']}: {row['accepted']} of {row['decided']} decisions correct"
            for row in breakdown
        )
        tail = f" So far — {measured}." if measured else ""
        return (
            "Not enough decisions yet to compare the engines. Each one needs at least "
            f"{MIN_REVIEWS_FOR_ACCURACY} decided reviews before a percentage is shown."
            f"{tail}"
        )
    best = max(comparable, key=lambda row: row["accuracy_percent"])
    others = [row for row in comparable if row is not best]
    rivals = "; ".join(
        f"{row['engine_label']} {row['accuracy_percent']}% of {row['sample_size']}"
        for row in others
    )
    return (
        f"{best['engine_label']} is ahead at {best['accuracy_percent']}% of "
        f"{best['sample_size']} decisions, against {rivals}. Both engines need to have "
        "been run over comparable photos for this to be a fair comparison."
    )
