# Bootstrap jaguar photos

Real camera-trap / field stills used to harden detection (color, IR, night flash, melanistic) and to seed coat-training workflows.

## Scan (OpenCV engine)

```bash
cd backend
python -c "from pathlib import Path; from app.services.vision import analyze_image; \
[print(p.name, analyze_image(p.read_bytes()).species_label, f'{analyze_image(p.read_bytes()).confidence:.0%}') for p in sorted(Path('fixtures/jaguars').glob('*.jpg'))]"
```

Latest automated scan: see `scan_report.json`.

## Labels

`labels.json` assigns **provisional** IDs (`BOOT-001` …). Similarity hints are **not** confirmations — merge only after human review in the app.

## Next step for training

1. Ingest into the running app (creates observations ready for review):

```bash
cd backend
python -m app.ingest_fixtures
# or target a specific account:
python -m app.ingest_fixtures --email you@example.com
python -m app.ingest_fixtures --dry-run
```

2. Open Observations / Review, confirm or create individuals.
3. When you have ≥2 photos per individual:

```bash
python -m app.export_train_set --out data/coat_train
python -m app.train_coat_reid --data data/coat_train --out data/models/coat-reid.pt
```

Six single photos of likely different animals will **not** train a strong re-ID model yet — they validate detection and start the gallery.
