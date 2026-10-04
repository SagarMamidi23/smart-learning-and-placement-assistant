"""Export ReadinessSnapshot records from MongoDB and retrain the readiness model on real outcomes.

Snapshots hold the features the app observed, but NOT what happened to the student afterwards. To retrain you
supply outcomes yourself, for example after a placement season, as a CSV:

    userId,domain,ready
    652f...,software,1
    652f...,civil,0

`ready` is whatever you decide counts as success (placed, passed the target exam, hired within N months). The most
recent snapshot per (userId, domain) is joined to its outcome.

    python retrain_from_snapshots.py --export-only                  # just dump the snapshots to CSV
    python retrain_from_snapshots.py --labels outcomes.csv          # export, join, retrain, write models/

Needs `pip install pymongo` and MONGO_URI (default mongodb://localhost:27017/slp). Retraining refuses to run with fewer
than MIN_LABELLED labelled rows or without both outcomes, because a model fitted to a handful of rows is worse than
the synthetic one.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterable
from pathlib import Path

import pandas as pd

import train as trainer
from app.features import FEATURES

MIN_LABELLED = 200


def flatten(snapshots: Iterable[dict]) -> pd.DataFrame:
    """One row per snapshot: ids and time, the seven features, the score served, and where it came from."""
    rows = []
    for s in snapshots:
        f = s.get("features") or {}
        if any(k not in f for k in FEATURES):
            continue  # an old or partial snapshot: skip rather than guess
        rows.append(
            {
                "userId": str(s["userId"]),
                "domain": s["domain"],
                "createdAt": pd.Timestamp(s["createdAt"]),
                **{k: float(f[k]) for k in FEATURES},
                "score": s.get("score"),
                "isFallback": bool(s.get("isFallback", False)),
                "modelVersion": s.get("modelVersion"),
            }
        )
    return pd.DataFrame(
        rows,
        columns=["userId", "domain", "createdAt", *FEATURES, "score", "isFallback", "modelVersion"],
    )


def join_outcomes(snapshots: pd.DataFrame, outcomes: pd.DataFrame) -> pd.DataFrame:
    need = {"userId", "domain", "ready"}
    if not need <= set(outcomes.columns):
        raise ValueError(f"labels CSV needs columns {sorted(need)}")
    outcomes = outcomes.assign(userId=outcomes["userId"].astype(str))
    latest = (
        snapshots.sort_values("createdAt").groupby(["userId", "domain"], as_index=False).tail(1)
    )
    return latest.merge(
        outcomes[["userId", "domain", "ready"]], on=["userId", "domain"], how="inner"
    )


def retrain(labelled: pd.DataFrame, out_dir: Path, n_estimators: int = 300) -> dict:
    if len(labelled) < MIN_LABELLED:
        raise ValueError(
            f"only {len(labelled)} labelled rows; need at least {MIN_LABELLED} to retrain"
        )
    if labelled["ready"].nunique() < 2:
        raise ValueError("the outcomes contain only one result; need both ready and not-ready")
    artifact = trainer.train(
        labelled[[*FEATURES, "ready"]],
        source="mongodb_snapshots+outcomes",
        n_estimators=n_estimators,
    )
    trainer.save(artifact, out_dir)
    return artifact


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--mongo-uri", default=os.environ.get("MONGO_URI", "mongodb://localhost:27017/slp")
    )
    p.add_argument("--db", default="slp")
    p.add_argument("--labels", type=Path, help="CSV of outcomes: userId,domain,ready")
    p.add_argument("--export-only", action="store_true")
    p.add_argument(
        "--export-path", type=Path, default=Path("../../data/processed/readiness_snapshots.csv")
    )
    p.add_argument("--out", type=Path, default=Path("models"))
    args = p.parse_args(argv)

    from pymongo import MongoClient  # imported here so the rest of the module works without it

    client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=5000)
    snaps = flatten(client[args.db]["readinesssnapshots"].find({}))
    args.export_path.parent.mkdir(parents=True, exist_ok=True)
    snaps.to_csv(args.export_path, index=False)
    print(f"exported {len(snaps)} snapshots to {args.export_path}")
    if args.export_only or not args.labels:
        if not args.export_only:
            print("no --labels given; nothing to retrain on (snapshots do not record outcomes)")
        return 0

    labelled = join_outcomes(snaps, pd.read_csv(args.labels))
    try:
        artifact = retrain(labelled, args.out)
    except ValueError as e:
        print(f"not retraining: {e}")
        return 1
    print(f"retrained on {len(labelled)} labelled rows -> {artifact['model_version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
