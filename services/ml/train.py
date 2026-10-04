"""Train the readiness model: compare logistic regression and a random forest, keep the better one.

    python train.py                       # generate (if needed) and train on the synthetic dataset
    python train.py --data some.csv       # train on any CSV with the feature columns plus a 0/1 "ready" column

Writes models/readiness.joblib (the model plus everything needed to serve and explain it) and
models/metrics.json (the numbers for the project report).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.features import FEATURES, MONOTONE
from generate_synthetic_data import generate

SEED = 42
TARGET = "ready"
# Prefer the simpler, more explainable model unless the non-linear one is clearly better.
SIMPLICITY_MARGIN = 0.005
# Only models that cannot contradict common sense can be served: a random forest is compared and reported, but it can
# let "doing less" raise a score, which would make the explanations shown to students untrustworthy.
ELIGIBLE = ("logistic_regression", "gradient_boosting_monotone")


def candidates(seed: int = SEED, n_estimators: int = 300) -> dict:
    return {
        "logistic_regression": Pipeline(
            [("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))]
        ),
        "gradient_boosting_monotone": HistGradientBoostingClassifier(
            max_iter=min(200, n_estimators),
            learning_rate=0.05,
            max_depth=3,
            monotonic_cst=[MONOTONE[f] for f in FEATURES],
            random_state=seed,
        ),
        # Reference only (see ELIGIBLE). Forest probabilities are poorly calibrated, so it is calibrated for a fair comparison.
        "random_forest": CalibratedClassifierCV(
            RandomForestClassifier(
                n_estimators=n_estimators, min_samples_leaf=5, random_state=seed, n_jobs=-1
            ),
            method="sigmoid",
            cv=5,
        ),
    }


def respects_monotonicity(model, X: pd.DataFrame, steps: int = 25) -> bool:
    """Sweep each signal from its lowest to highest value with the others held typical. The predicted probability
    must never move against that signal's allowed direction (see app.features.MONOTONE)."""
    typical = X.mean()
    for f in FEATURES:
        grid = np.linspace(X[f].min(), X[f].max(), steps)
        frame = pd.DataFrame([typical] * steps)
        frame[f] = grid
        proba = model.predict_proba(frame[FEATURES])[:, 1]
        change = np.diff(proba) * MONOTONE[f]
        if (change < -1e-9).any():
            return False
    return True


def holdout_metrics(model, X: pd.DataFrame, y: pd.Series) -> dict:
    proba = model.predict_proba(X)[:, 1]
    pred = (proba >= 0.5).astype(int)
    return {
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "f1": round(float(f1_score(y, pred)), 4),
        "roc_auc": round(float(roc_auc_score(y, proba)), 4),
        "brier": round(float(brier_score_loss(y, proba)), 4),
    }


def version_for(df: pd.DataFrame, kind: str) -> str:
    digest = hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()[:8]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"readiness-{kind}-{stamp}-{digest}"


def train(
    df: pd.DataFrame, seed: int = SEED, source: str = "synthetic", n_estimators: int = 300
) -> dict:
    missing = [c for c in [*FEATURES, TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"dataset is missing columns: {missing}")
    X, y = df[FEATURES], df[TARGET].astype(int)
    if y.nunique() < 2:
        raise ValueError("the dataset needs both ready and not-ready examples")
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    report: dict[str, dict] = {}
    fitted = {}
    for name, model in candidates(seed, n_estimators).items():
        cv = cross_val_score(model, X_tr, y_tr, cv=5, scoring="roc_auc")
        model.fit(X_tr, y_tr)
        fitted[name] = model
        report[name] = {
            "cv_roc_auc_mean": round(float(cv.mean()), 4),
            "cv_roc_auc_std": round(float(cv.std()), 4),
            **holdout_metrics(model, X_te, y_te),
        }

    best = "logistic_regression"
    if (
        report["gradient_boosting_monotone"]["roc_auc"]
        > report["logistic_regression"]["roc_auc"] + SIMPLICITY_MARGIN
    ):
        best = "gradient_boosting_monotone"
    # A model is only served if the sweep confirms it never contradicts common sense; otherwise try the other one.
    order = [best] + [m for m in ELIGIBLE if m != best]
    for name in report:
        report[name]["monotone_ok"] = respects_monotonicity(fitted[name], X_tr)
        report[name]["eligible_to_serve"] = name in ELIGIBLE and report[name]["monotone_ok"]
    servable = [m for m in order if report[m]["eligible_to_serve"]]
    if not servable:
        raise ValueError("no candidate model respects the monotonic constraints on this data")
    best = servable[0]

    version = version_for(df, best)
    metrics = {
        "model_version": version,
        "selected": best,
        "selection_rule": (
            f"among eligible models ({', '.join(ELIGIBLE)}), logistic regression unless the boosted model wins by more than {SIMPLICITY_MARGIN} ROC-AUC; "
            "the random forest is reported for comparison but not served (no monotonic guarantee)"
        ),
        "data": {
            "source": source,
            "rows": len(df),
            "train_rows": len(X_tr),
            "test_rows": len(X_te),
            "positive_rate": round(float(y.mean()), 4),
        },
        "candidates": report,
        "sklearn": sklearn.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "caveat": (
            "Labels come from a known formula over hidden traits, so scores show the pipeline works, "
            "not that real readiness is this predictable."
            if source == "synthetic"
            else "Trained on the supplied dataset."
        ),
    }
    return {
        "model": fitted[best],
        "features": FEATURES,
        "means": {f: float(X_tr[f].mean()) for f in FEATURES},
        "model_version": version,
        "metrics": metrics,
    }


def save(artifact: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, out_dir / "readiness.joblib")
    (out_dir / "metrics.json").write_text(json.dumps(artifact["metrics"], indent=2) + "\n")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--data", type=Path, help="CSV to train on (default: generate the synthetic dataset)"
    )
    p.add_argument("--out", type=Path, default=Path("models"))
    p.add_argument("--seed", type=int, default=SEED)
    args = p.parse_args(argv)

    if args.data:
        df, source = pd.read_csv(args.data), f"csv:{args.data.name}"
    else:
        df, source = generate(seed=args.seed), "synthetic"
    artifact = train(df, args.seed, source)
    save(artifact, args.out)

    m = artifact["metrics"]
    print(
        f"trained on {m['data']['rows']} rows ({source}); selected {m['selected']} -> {m['model_version']}"
    )
    for name, r in m["candidates"].items():
        print(
            f"  {name:20s} acc={r['accuracy']:.3f} f1={r['f1']:.3f} roc_auc={r['roc_auc']:.3f} "
            f"brier={r['brier']:.3f} cv_auc={r['cv_roc_auc_mean']:.3f}+/-{r['cv_roc_auc_std']:.3f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
