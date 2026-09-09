"""Admin-facing coat re-ID train pipeline: export → train → activate."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.backfill_embeddings import run_backfill
from app.config import get_settings
from app.export_train_set import assess_readiness, export_train_set
from app.models import MatchReview, Media, User
from app.services.identity import audit
from app.services.recognition.service import reset_recognition_service
from app.train_coat_reid import train

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = BACKEND_ROOT / "data"
TRAIN_DIR = DATA_ROOT / "coat_train"
MODEL_DIR = DATA_ROOT / "models"
CHECKPOINT = MODEL_DIR / "coat-reid.pt"
ACTIVE_FILE = MODEL_DIR / "active_engine.json"
HARD_NEG_FILE = "hard_negatives.jsonl"


def active_engine_config() -> dict:
    if not ACTIVE_FILE.exists():
        return {}
    try:
        return json.loads(ACTIVE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def apply_active_engine_overrides() -> None:
    """Apply activated checkpoint path into settings for this process."""
    cfg = active_engine_config()
    if not cfg:
        return
    settings = get_settings()
    path = str(cfg.get("coat_model_path") or "").strip()
    if path:
        object.__setattr__(settings, "coat_model_path", path)
    engine = str(cfg.get("recognition_engine") or "").strip()
    if engine:
        object.__setattr__(settings, "recognition_engine", engine)


def export_hard_negatives(db: Session, out_dir: Path) -> int:
    """Write rejected / disagreed suggestions as hard-negative pairs for training."""
    rows = db.scalars(
        select(MatchReview).where(
            MatchReview.was_correct.is_(False),
            MatchReview.suggested_individual_id.is_not(None),
        )
    ).all()
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / HARD_NEG_FILE
    written = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            if not row.detection_id:
                continue
            media = db.scalar(
                select(Media)
                .where(Media.detection_id == row.detection_id, Media.kind.in_(("photo", "frame")))
                .order_by(Media.created_at.asc())
                .limit(1)
            )
            if not media:
                continue
            record = {
                "detection_id": row.detection_id,
                "media_id": media.id,
                "suggested_individual_id": row.suggested_individual_id,
                "confirmed_individual_id": row.confirmed_individual_id,
                "similarity_score": row.similarity_score,
                "engine": row.engine,
                "model_version": row.model_version,
            }
            handle.write(json.dumps(record) + "\n")
            written += 1
    return written


def run_export(db: Session, *, actor: User | None = None) -> dict:
    TRAIN_DIR.mkdir(parents=True, exist_ok=True)
    readiness = assess_readiness(db)
    report = export_train_set(db, TRAIN_DIR, dry_run=False)
    hard = export_hard_negatives(db, TRAIN_DIR)
    if actor:
        audit(db, actor, "export_train_set", "recognition", "coat", str(report.written))
        db.commit()
    return {
        "out_dir": str(TRAIN_DIR),
        "written": report.written,
        "skipped": report.skipped,
        "failed": report.failed,
        "hard_negatives": hard,
        "readiness": asdict(readiness),
    }


def run_train(
    db: Session,
    *,
    actor: User | None = None,
    force: bool = False,
    epochs: int = 12,
) -> dict:
    readiness = assess_readiness(db)
    if not readiness.ready_for_train and not force:
        raise RuntimeError(readiness.reason or "Not enough confirmed data to train")

    export_info = run_export(db, actor=actor)
    if export_info["written"] < 6 and not force:
        raise RuntimeError("Export produced too few crops to train. Confirm more jaguar identities.")

    version = f"coat-reid-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
    result = train(
        TRAIN_DIR,
        CHECKPOINT,
        epochs=epochs,
        model_version=version,
        hard_negatives_path=TRAIN_DIR / HARD_NEG_FILE,
    )
    if actor:
        audit(db, actor, "train_coat_model", "recognition", version, result.get("out"))
        db.commit()
    return {
        **result,
        "export": export_info,
        "forced": force,
        "readiness": asdict(readiness),
    }


def run_activate(db: Session, *, actor: User | None = None, backfill: bool = True) -> dict:
    if not CHECKPOINT.exists():
        raise RuntimeError(f"No checkpoint at {CHECKPOINT}. Train a model first.")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "recognition_engine": "trained",
        "coat_model_path": str(CHECKPOINT.resolve()),
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "activated_by": actor.email if actor else None,
    }
    ACTIVE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    settings = get_settings()
    object.__setattr__(settings, "coat_model_path", payload["coat_model_path"])
    object.__setattr__(settings, "recognition_engine", "trained")
    reset_recognition_service()

    backfill_report: dict | None = None
    if backfill:
        try:
            report = run_backfill(db, dry_run=False)
            backfill_report = asdict(report)
        except Exception as exc:
            logger.warning("Gallery backfill after activate failed: %s", exc)
            backfill_report = {"error": str(exc)}

    if actor:
        audit(db, actor, "activate_coat_model", "recognition", "trained", payload["coat_model_path"])
        db.commit()

    return {"active": payload, "backfill": backfill_report}


def status(db: Session) -> dict:
    readiness = assess_readiness(db)
    active = active_engine_config()
    settings = get_settings()
    return {
        "readiness": asdict(readiness),
        "checkpoint_exists": CHECKPOINT.exists(),
        "checkpoint_path": str(CHECKPOINT) if CHECKPOINT.exists() else None,
        "active": active,
        "settings": {
            "recognition_engine": settings.recognition_engine,
            "coat_model_path": settings.coat_model_path or None,
        },
        "train_dir": str(TRAIN_DIR),
    }
