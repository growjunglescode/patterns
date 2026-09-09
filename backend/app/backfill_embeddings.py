"""Add photos of already-confirmed individuals to the ML match library.

Run from the backend directory:

    python -m app.backfill_embeddings              # encode everything missing
    python -m app.backfill_embeddings --dry-run    # show the plan, write nothing
    python -m app.backfill_embeddings --limit 50   # stop after 50 photos

Fresh installs start with an empty `coat_embeddings` gallery, so uploads have
nothing to compare against until somebody confirms photos one at a time. This
command seeds that gallery from the catalog that already exists.

Identity is still never assigned automatically: this only copies identities a
human already recorded.
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal
from app.db import engine as db_engine
from app.models import CoatEmbedding, Detection, Media
from app.services import get_storage
from app.services.recognition.embedding_engine import EmbeddingRecognitionEngine
from app.services.recognition.types import REVIEW_REJECTED

logger = logging.getLogger(__name__)

# compute_grade() only awards these two grades once a reviewer has linked the
# photo to a catalogued individual. "needs_id" and "casual" rows keep the
# engine's guess in suggested_individual_id and must stay out of the gallery,
# otherwise a wrong guess starts teaching itself.
TRUSTED_GRADES = ("confirmed", "research_grade")

# Media kinds that hold a still image. A "video" row is the raw clip; its
# encodable still is stored separately as a "frame".
IMAGE_KINDS = ("photo", "frame")

# Species values that mean "we could not tell what this is".
UNTRUSTED_SPECIES = ("unknown", "other_or_empty", "unreadable")

VALID_SIDES = ("L", "R", "B", "U")
SIDE_LABELS = {"L": "left flank", "R": "right flank", "B": "both flanks", "U": "side not recorded"}

COMMIT_EVERY = 25
PROGRESS_EVERY = 25

MODEL_HELP = """Could not load the ResNet50 photo model, so no photos were encoded.

This almost always means PyTorch is missing, or the pretrained weights could
not be downloaded. From the backend directory, install them with:

    pip install torch torchvision

The first run needs internet access once to fetch the ResNet50 weights (about
100 MB); after that it works offline. Nothing is broken in the meantime: the
app falls back to the older OpenCV matcher for uploads."""


class ModelUnavailable(RuntimeError):
    """PyTorch or the pretrained ResNet50 weights could not be loaded."""


@dataclass
class BackfillReport:
    found: int = 0
    planned: int = 0
    encoded: int = 0
    relinked: int = 0
    skipped: int = 0
    failed: int = 0
    dry_run: bool = False
    model_version: str = ""
    failures: list[str] = field(default_factory=list)


def normalize_side(raw: str | None) -> str:
    """Keep flanks distinct: L and R never collapse into one bucket."""
    side = (raw or "U").strip().upper()[:1]
    return side if side in VALID_SIDES else "U"


def trusted_media(db: Session) -> list[Media]:
    """Photos whose individual identity a human already recorded."""
    stmt = (
        select(Media)
        .join(Detection, Detection.id == Media.detection_id)
        .where(
            Media.kind.in_(IMAGE_KINDS),
            Detection.individual_id.is_not(None),
            Detection.grade.in_(TRUSTED_GRADES),
            Detection.species.not_in(UNTRUSTED_SPECIES),
            or_(Detection.review_state.is_(None), Detection.review_state != REVIEW_REJECTED),
        )
        .order_by(Media.created_at, Media.id)
    )
    return list(db.scalars(stmt).all())


def existing_by_media(db: Session, model_version: str) -> dict[str, CoatEmbedding]:
    """Gallery rows for this exact model version, keyed by photo.

    A different model version is deliberately absent from this map so the same
    photo can be re-encoded when the model changes.
    """
    rows = db.scalars(
        select(CoatEmbedding).where(
            CoatEmbedding.media_id.is_not(None),
            CoatEmbedding.model_version == model_version,
        )
    ).all()
    return {row.media_id: row for row in rows if row.media_id}


def gallery_side_counts(db: Session, model_version: str) -> Counter:
    rows = db.execute(
        select(CoatEmbedding.side, func.count())
        .where(
            CoatEmbedding.individual_id.is_not(None),
            CoatEmbedding.model_version == model_version,
        )
        .group_by(CoatEmbedding.side)
    ).all()
    counts: Counter = Counter()
    for side, total in rows:
        counts[normalize_side(side)] += total
    return counts


def run_backfill(
    db: Session,
    *,
    engine: EmbeddingRecognitionEngine | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    out: Callable[[str], None] = print,
) -> BackfillReport:
    report = BackfillReport(dry_run=dry_run)
    encoder = engine or EmbeddingRecognitionEngine()
    if not encoder.available():
        raise ModelUnavailable(MODEL_HELP)

    model_version = encoder.model_version
    model_name = getattr(encoder, "model_name", encoder.name)
    report.model_version = model_version
    existing = existing_by_media(db, model_version)
    media_rows = trusted_media(db)
    report.found = len(media_rows)

    out(f"Match library backfill using {model_name} ({model_version}).")
    out(f"Found {report.found} photo(s) of confirmed individuals in the catalog.")

    pending: list[tuple[Media, Detection, CoatEmbedding | None]] = []
    for media in media_rows:
        detection = media.detection
        row = existing.get(media.id)
        if row is None:
            pending.append((media, detection, None))
        elif row.individual_id != detection.individual_id:
            # Already encoded, but pointing at the wrong cat (or at nobody).
            # Repair it instead of adding a duplicate vector.
            pending.append((media, detection, row))
        else:
            report.skipped += 1

    if report.skipped:
        out(f"Skipping {report.skipped} photo(s) already encoded with this model version.")
    if limit is not None:
        pending = pending[:limit]
    report.planned = len(pending)

    if dry_run:
        out(f"Dry run: would encode {report.planned} photo(s). Nothing was written.")
        return report

    if not report.planned:
        out("Nothing new to encode. The match library is already up to date.")
        return report

    out(f"Encoding {report.planned} photo(s). This takes a few seconds each on a laptop CPU.")
    storage = get_storage()
    handled = 0
    for media, detection, row in pending:
        handled += 1
        label = media.original_filename or media.storage_key
        try:
            data = storage.read(media.storage_key)
        except Exception as exc:  # missing file, permissions, blob error
            _record_failure(report, out, f"{label}: the stored photo file could not be opened ({exc})")
            continue

        try:
            vector = encoder.encode_gallery_image(data)
        except Exception as exc:
            logger.exception("Encoding failed for media %s", media.id)
            _record_failure(report, out, f"{label}: the photo could not be encoded ({exc})")
            continue

        if not vector:
            _record_failure(report, out, f"{label}: the file is not a readable image, so it was left out")
            continue

        side = normalize_side(detection.side)
        if row is not None:
            row.individual_id = detection.individual_id
            row.side = side
            report.relinked += 1
        else:
            db.add(
                CoatEmbedding(
                    media_id=media.id,
                    detection_id=detection.id,
                    individual_id=detection.individual_id,
                    embedding_json=json.dumps(vector),
                    side=side,
                    captured_at=detection.captured_at,
                    latitude=detection.latitude,
                    longitude=detection.longitude,
                    model_name=model_name,
                    model_version=model_version,
                )
            )
            report.encoded += 1

        if handled % COMMIT_EVERY == 0:
            db.commit()
        if handled % PROGRESS_EVERY == 0 or handled == report.planned:
            out(f"  Encoded {handled} of {report.planned} photos...")

    db.commit()
    return report


def _record_failure(report: BackfillReport, out: Callable[[str], None], message: str) -> None:
    report.failed += 1
    report.failures.append(message)
    out(f"  Left out one photo: {message}")


def print_summary(db: Session, report: BackfillReport, out: Callable[[str], None] = print) -> None:
    model_version = report.model_version
    out("")
    out("Summary")
    if report.dry_run:
        out(f"  Would encode: {report.planned} photo(s) (dry run, nothing saved)")
    else:
        out(f"  Encoded:      {report.encoded} photo(s) added to the match library")
        if report.relinked:
            out(f"  Repaired:     {report.relinked} photo(s) re-linked to the right individual")
    out(f"  Skipped:      {report.skipped} photo(s) already encoded with {model_version}")
    out(f"  Failed:       {report.failed} photo(s) could not be read (listed above)")

    counts = gallery_side_counts(db, model_version)
    total = sum(counts.values())
    out("")
    if total:
        parts = ", ".join(f"{counts[side]} {SIDE_LABELS[side]}" for side in VALID_SIDES if counts[side])
        out(f"Match library now holds {total} confirmed photo(s): {parts}.")
        out("Left and right flanks are compared separately, so they are never mixed.")
    else:
        out("Match library is still empty. Confirm some identities, then run this again.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.backfill_embeddings",
        description="Add photos of already-confirmed individuals to the ML match library.",
    )
    parser.add_argument("--dry-run", action="store_true", help="show what would happen and write nothing")
    parser.add_argument("--limit", type=int, default=None, metavar="N", help="encode at most N photos, then stop")
    args = parser.parse_args(argv)

    if args.limit is not None and args.limit <= 0:
        print("--limit needs a positive number of photos, for example --limit 50.")
        return 2

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    Base.metadata.create_all(bind=db_engine)

    db = SessionLocal()
    try:
        report = run_backfill(db, limit=args.limit, dry_run=args.dry_run)
        print_summary(db, report)
    except ModelUnavailable as exc:
        print("")
        print(str(exc))
        return 2
    finally:
        db.close()
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
