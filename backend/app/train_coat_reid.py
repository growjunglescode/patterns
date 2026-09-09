"""Train a coat re-ID projection head from exported confirmed crops.

Requires a prior export:

    python -m app.export_train_set --out data/coat_train
    python -m app.train_coat_reid --data data/coat_train --out data/models/coat-reid.pt

Uses triplet loss on ResNet50 features with a learned projection, online hard
negatives, and optional MatchReview hard-negative pairs. Identity is still
never assigned automatically at inference — this only improves ranking.
"""

from __future__ import annotations

import argparse
import json
import logging
import random
from collections import defaultdict
from pathlib import Path

logger = logging.getLogger(__name__)


def _load_manifest(data_dir: Path) -> list[dict]:
    path = data_dir / "manifest.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run: python -m app.export_train_set --out {data_dir}")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def _load_hard_negatives(path: Path | None) -> list[dict]:
    if not path or not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def train(
    data_dir: Path,
    out_path: Path,
    *,
    epochs: int = 12,
    embedding_dim: int = 256,
    batch_triplets: int = 24,
    lr: float = 1e-3,
    model_version: str = "coat-reid-v1",
    seed: int = 7,
    hard_negatives_path: Path | None = None,
    margin: float = 0.35,
) -> dict:
    import torch
    import torch.nn.functional as F
    from PIL import Image
    from torchvision.models import ResNet50_Weights, resnet50

    random.seed(seed)
    torch.manual_seed(seed)

    rows = _load_manifest(data_dir)
    by_id: dict[str, list[dict]] = defaultdict(list)
    media_to_individual: dict[str, str] = {}
    for row in rows:
        by_id[row["individual_id"]].append(row)
        media_to_individual[row["media_id"]] = row["individual_id"]
    eligible = {iid: items for iid, items in by_id.items() if len(items) >= 2}
    if len(eligible) < 3:
        raise RuntimeError(
            f"Need ≥3 individuals with ≥2 photos each; have {len(eligible)}. "
            "Confirm more identities, then re-export."
        )

    hard_rows = _load_hard_negatives(hard_negatives_path)
    # Map: anchor individual -> set of individual ids that were wrong suggestions.
    hard_by_anchor: dict[str, set[str]] = defaultdict(set)
    for item in hard_rows:
        confirmed = item.get("confirmed_individual_id")
        suggested = item.get("suggested_individual_id")
        media_id = item.get("media_id")
        anchor = confirmed or media_to_individual.get(media_id or "")
        if anchor and suggested and suggested in eligible and anchor in eligible and suggested != anchor:
            hard_by_anchor[anchor].add(suggested)

    weights = ResNet50_Weights.IMAGENET1K_V2
    preprocess = weights.transforms()
    backbone = torch.nn.Sequential(*list(resnet50(weights=weights).children())[:-1])
    for param in backbone.parameters():
        param.requires_grad = False
    backbone.eval()

    projection = torch.nn.Sequential(
        torch.nn.Linear(2048, embedding_dim),
        torch.nn.ReLU(inplace=True),
        torch.nn.Linear(embedding_dim, embedding_dim),
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    backbone.to(device)
    projection.to(device)
    optimizer = torch.optim.AdamW(projection.parameters(), lr=lr, weight_decay=1e-4)

    def encode_crop(rel_path: str) -> torch.Tensor:
        image = Image.open(data_dir / rel_path).convert("RGB")
        tensor = preprocess(image).unsqueeze(0).to(device)
        with torch.no_grad():
            feats = backbone(tensor).flatten(1)
        return feats

    feature_cache: dict[str, torch.Tensor] = {}
    for items in eligible.values():
        for item in items:
            key = item["crop"]
            if key not in feature_cache:
                feature_cache[key] = encode_crop(key).squeeze(0).cpu()

    ids = list(eligible.keys())
    history: list[float] = []
    hard_hits = 0
    projection.train()
    for epoch in range(epochs):
        losses = []
        steps = max(32, batch_triplets * 2)
        for _ in range(steps):
            anchor_id = random.choice(ids)
            a_item, p_item = random.sample(eligible[anchor_id], 2)

            # Prefer MatchReview hard negatives when available.
            preferred = [nid for nid in hard_by_anchor.get(anchor_id, set()) if nid in eligible]
            if preferred and random.random() < 0.55:
                neg_id = random.choice(preferred)
                n_item = random.choice(eligible[neg_id])
                hard_hits += 1
            else:
                # Online semi-hard: pick the negative currently closest to the anchor.
                with torch.no_grad():
                    a_probe = F.normalize(
                        projection(feature_cache[a_item["crop"]].unsqueeze(0).to(device)),
                        dim=1,
                    )
                    best_neg = None
                    best_sim = -1.0
                    candidates = [i for i in ids if i != anchor_id]
                    for nid in random.sample(candidates, k=min(8, len(candidates))):
                        probe_item = random.choice(eligible[nid])
                        n_probe = F.normalize(
                            projection(feature_cache[probe_item["crop"]].unsqueeze(0).to(device)),
                            dim=1,
                        )
                        sim = float((a_probe * n_probe).sum().item())
                        if sim > best_sim:
                            best_sim = sim
                            best_neg = (nid, probe_item)
                    if best_neg:
                        neg_id, n_item = best_neg
                    else:
                        neg_id = random.choice(candidates)
                        n_item = random.choice(eligible[neg_id])

            a = projection(feature_cache[a_item["crop"]].unsqueeze(0).to(device))
            p = projection(feature_cache[p_item["crop"]].unsqueeze(0).to(device))
            n = projection(feature_cache[n_item["crop"]].unsqueeze(0).to(device))
            a = F.normalize(a, dim=1)
            p = F.normalize(p, dim=1)
            n = F.normalize(n, dim=1)
            loss = F.triplet_margin_loss(a, p, n, margin=margin)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(float(loss.item()))
        mean_loss = sum(losses) / max(len(losses), 1)
        history.append(mean_loss)
        logger.info("epoch %s/%s loss=%.4f hard_hits=%s", epoch + 1, epochs, mean_loss, hard_hits)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model_version": model_version,
        "embedding_dim": embedding_dim,
        "train_backbone": False,
        "projection": projection.state_dict(),
        "individuals": len(eligible),
        "photos": sum(len(v) for v in eligible.values()),
        "hard_negative_anchors": len(hard_by_anchor),
        "hard_hits": hard_hits,
        "loss_history": history,
        "margin": margin,
    }
    torch.save(payload, out_path)
    return {
        "out": str(out_path),
        "model_version": model_version,
        "individuals": len(eligible),
        "photos": payload["photos"],
        "hard_negative_anchors": len(hard_by_anchor),
        "hard_hits": hard_hits,
        "final_loss": history[-1] if history else None,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Train coat re-ID projection head")
    parser.add_argument("--data", type=Path, default=Path("data/coat_train"))
    parser.add_argument("--out", type=Path, default=Path("data/models/coat-reid.pt"))
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--embedding-dim", type=int, default=256)
    parser.add_argument("--model-version", default="coat-reid-v1")
    parser.add_argument("--hard-negatives", type=Path, default=None)
    args = parser.parse_args()
    hard = args.hard_negatives or (args.data / "hard_negatives.jsonl")
    result = train(
        args.data,
        args.out,
        epochs=args.epochs,
        embedding_dim=args.embedding_dim,
        model_version=args.model_version,
        hard_negatives_path=hard if hard.exists() else None,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
