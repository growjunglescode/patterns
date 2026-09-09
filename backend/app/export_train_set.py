"""Export confirmed coat photos as a re-ID training set.

Patterns never auto-names animals. Training data comes only from human-confirmed
detections (confirmed / research_grade). Export produces:

  out_dir/
    manifest.jsonl   one JSON object per photo
    crops/           animal-region JPEGs named {individual_id}_{media_id}.jpg
    readiness.json   counts and whether training is recommended

Run:

    python -m app.export_train_set --out data/coat_train
    python -m app.export_train_set --out data/coat_train --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.backfill_embeddings import IMAGE_KINDS, TRUSTED_GRADES, UNTRUSTED_SPECIES, normalize_side
from app.db import SessionLocal
from app.models import Detection, Individual, Media
from app.services import get_storage
from app.services.vision import analyze_image

logger = logging.getLogger(__name__)

# Metric learning needs multiple photos per identity to form positive pairs.
MIN_PHOTOS_PER_INDIVIDUAL = 2
MIN_INDIVIDUALS_FOR_TRAIN = 5
MIN_TOTAL_PHOTOS_FOR_TRAIN = 20


@dataclass
class Readiness:
    trusted_photos: int = 0
    individuals_with_photos: int = 0
    individuals_with_multi_photo: int = 0
    ready_for_train: bool = False
    reason: str = ""
    by_species: dict[str, int] = field(default_factory=dict)
    by_side: dict[str, int] = field(default_factory=dict)


@dataclass
class ExportReport:
    written: int = 0
    skipped: int = 0
    failed: int = 0
    dry_run: bool = False
    out_dir: str = ""
    readiness: Readiness = field(default_factory=Readiness)
    failures: list[str] = field(default_factory=list)


def trusted_training_media(db: Session) -> list[Media]:
    stmt = (
        select(Media)
        .join(Detection, Detection.id == Media.detection_id)
        .where(
            Media.kind.in_(IMAGE_KINDS),
            Detection.individual_id.is_not(None),
            Detection.grade.in_(TRUSTED_GRADES),
            Detection.species.is_not(None),
        )
        .order_by(Media.created_at.asc())
    )
    rows = db.scalars(stmt).all()
    return [
        media
        for media in rows
        if media.detection
        and (media.detection.species or "").lower() not in UNTRUSTED_SPECIES
    ]


def assess_readiness(db: Session) -> Readiness:
    media = trusted_training_media(db)
    per_individual: Counter[str] = Counter()
    by_species: Counter[str] = Counter()
    by_side: Counter[str] = Counter()
    for item in media:
        det = item.detection
        if not det or not det.individual_id:
            continue
        per_individual[det.individual_id] += 1
        by_species[det.species or "unknown"] += 1
        by_side[normalize_side(det.side)] += 1

    multi = sum(1 for count in per_individual.values() if count >= MIN_PHOTOS_PER_INDIVIDUAL)
    total = len(media)
    identities = len(per_individual)
    ready = (
        identities >= MIN_INDIVIDUALS_FOR_TRAIN
        and multi >= MIN_INDIVIDUALS_FOR_TRAIN
        and total >= MIN_TOTAL_PHOTOS_FOR_TRAIN
    )
    if ready:
        reason = (
            f"Ready: {total} confirmed photos across {identities} individuals "
            f"({multi} with ≥{MIN_PHOTOS_PER_INDIVIDUAL} photos)."
        )
    elif total == 0:
        reason = (
            "No confirmed photos yet. Upload camera-trap media and confirm identities "
            "in review before training."
        )
    else:
        reason = (
            f"Need more confirmed data. Have {total} photos / {identities} individuals "
            f"({multi} multi-photo). Target ≥{MIN_TOTAL_PHOTOS_FOR_TRAIN} photos, "
            f"≥{MIN_INDIVIDUALS_FOR_TRAIN} individuals with ≥{MIN_PHOTOS_PER_INDIVIDUAL} photos each."
        )
    return Readiness(
        trusted_photos=total,
        individuals_with_photos=identities,
        individuals_with_multi_photo=multi,
        ready_for_train=ready,
        reason=reason,
        by_species=dict(by_species),
        by_side=dict(by_side),
    )


def export_train_set(db: Session, out_dir: Path, *, dry_run: bool = False) -> ExportReport:
    readiness = assess_readiness(db)
    report = ExportReport(dry_run=dry_run, out_dir=str(out_dir), readiness=readiness)
    media = trusted_training_media(db)
    if dry_run:
        report.written = len(media)
        return report

    crops_dir = out_dir / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    storage = get_storage()
    individuals = {
        row.id: row for row in db.scalars(select(Individual)).all()
    }
    manifest_path = out_dir / "manifest.jsonl"
    with manifest_path.open("w", encoding="utf-8") as handle:
        for item in media:
            det = item.detection
            if not det or not det.individual_id:
                report.skipped += 1
                continue
            try:
                raw = storage.read(item.storage_key)
                vision = analyze_image(raw)
                if vision.animal_box is None:
                    report.skipped += 1
                    continue
                # Re-decode and crop for a stable training JPEG.
                import cv2
                import numpy as np

                array = np.frombuffer(raw, dtype=np.uint8)
                bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
                if bgr is None:
                    report.skipped += 1
                    continue
                x, y, w, h = vision.animal_box
                crop = bgr[y : y + h, x : x + w]
                if crop.size == 0:
                    report.skipped += 1
                    continue
                filename = f"{det.individual_id}_{item.id}.jpg"
                crop_path = crops_dir / filename
                ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
                if not ok:
                    report.failed += 1
                    report.failures.append(item.id)
                    continue
                crop_path.write_bytes(buf.tobytes())
                individual = individuals.get(det.individual_id)
                record = {
                    "media_id": item.id,
                    "detection_id": det.id,
                    "individual_id": det.individual_id,
                    "individual_code": individual.code if individual else None,
                    "species": det.species,
                    "side": normalize_side(det.side),
                    "grade": det.grade,
                    "crop": f"crops/{filename}",
                    "animal_box": list(vision.animal_box),
                    "rosette_confidence": vision.confidence,
                }
                handle.write(json.dumps(record) + "\n")
                report.written += 1
            except Exception as exc:
                logger.exception("Failed to export media %s", item.id)
                report.failed += 1
                report.failures.append(f"{item.id}: {exc}")

    (out_dir / "readiness.json").write_text(
        json.dumps(asdict(readiness), indent=2),
        encoding="utf-8",
    )
    return report


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Export confirmed coat crops for re-ID training")
    parser.add_argument("--out", type=Path, default=Path("data/coat_train"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        report = export_train_set(db, args.out, dry_run=args.dry_run)
    finally:
        db.close()
    print(json.dumps(asdict(report), indent=2))
    if not report.readiness.ready_for_train:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
