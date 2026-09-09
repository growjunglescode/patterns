# Coat recognition (Patterns)

Patterns treats recognition as **propose → human review**. The model never auto-names an animal.

## Engines

| Engine | Role |
| --- | --- |
| `opencv` | Always available. Rosette texture + coat fingerprint. |
| `embedding` | ImageNet ResNet50 features (needs `torch`). Not jaguar-trained. |
| `trained` | Fine-tuned coat re-ID projection (`COAT_MODEL_PATH`). |
| `auto` | Prefer `trained` → `embedding` → `opencv`. |

Set in environment:

```
RECOGNITION_ENGINE=auto
SUGGEST_THRESHOLD=0.68
MATCH_THRESHOLD=0.82
COAT_MODEL_PATH=data/models/coat-reid.pt
```

## Improve detection

Upload localization now:

- Strips common camera-trap footer bars
- Scores edge + warm-coat + IR subject + dark-silhouette boxes
- Uses IR-aware pattern scoring for B&W trail cams and melanistic cues for black jaguars

Sample trap photos live in `backend/fixtures/jaguars/` (color, IR, night flash, melanistic).

Ingest into a running database:

```bash
python -m app.ingest_fixtures --email you@example.com
```

## Train a coat algorithm

Training uses **only human-confirmed** photos (`confirmed` / `research_grade`), plus hard negatives from disagreed match reviews.

### Admin UI (preferred)

**Admin → Recognition → Train coat model**

| Action | What it does |
|--------|----------------|
| **Train model** | Export crops + hard negatives → triplet train → activate → gallery backfill |
| **Export training set** | Confirmed crops + `hard_negatives.jsonl` only |
| **Activate checkpoint** | Point the live engine at `data/models/coat-reid.pt` and rebuild embeddings |
| **Force train** | Same as Train when readiness thresholds are not met (for smoke tests) |

API: `POST /api/admin/recognition/{export,train,activate}` (admin only).

Targets (defaults): ≥20 photos, ≥5 individuals with ≥2 photos each. Training itself needs ≥3 multi-photo individuals.

### CLI

```bash
cd backend
python -m app.export_train_set --out data/coat_train
pip install torch torchvision
python -m app.train_coat_reid --data data/coat_train --out data/models/coat-reid.pt
python -m app.backfill_embeddings
```

Or set env and restart:

```bash
set COAT_MODEL_PATH=data/models/coat-reid.pt
set RECOGNITION_ENGINE=trained
```

### Measure

Admin → Recognition (engine + readiness + ledger). `/model` uses `MatchReview` agreement.

## Invariant

High similarity → `potential_match` only. People confirm. Dual review still applies for research grade.
