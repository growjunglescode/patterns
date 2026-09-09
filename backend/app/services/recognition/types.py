"""Shared types and review-state constants for jaguar recognition."""

from __future__ import annotations

from dataclasses import dataclass, field


REVIEW_POTENTIAL = "potential_match"
REVIEW_CONFIRMED = "confirmed_match"
REVIEW_REJECTED = "rejected_match"
REVIEW_NEW = "new_jaguar"  # stored value; UI label is species-neutral
REVIEW_AWAITING_SECOND = "awaiting_second_review"

REVIEW_LABELS = {
    REVIEW_POTENTIAL: "Potential Match",
    REVIEW_CONFIRMED: "Confirmed Match",
    REVIEW_REJECTED: "Rejected Match",
    REVIEW_NEW: "New individual",
    REVIEW_AWAITING_SECOND: "Awaiting second review",
}

# Below this many confirmed photos, an empty candidate list says nothing about
# the animal — there is simply not enough material to compare against.
GALLERY_WARMUP_PHOTOS = 10


@dataclass
class AnalyzeResult:
    """Species score plus identity embedding. Identity is never auto-applied."""

    is_jaguar: bool
    species_label: str
    confidence: float
    summary: str
    identity_embedding: list[float]
    opencv_embedding: list[float]
    animal_box: tuple[int, int, int, int] | None
    engine: str
    model_version: str
    extra: dict[str, str] = field(default_factory=dict)


@dataclass
class ScoredIndividual:
    individual_id: str
    score: float


@dataclass
class MatchLibraryStatus:
    """How much comparable material the active engine actually has."""

    size: int
    ready: bool
    note: str | None
