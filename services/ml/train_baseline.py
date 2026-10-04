"""Baseline: show the training method works on REAL records, before using the synthetic in-app dataset.

Two public datasets (see data/DATA_SOURCES.md):
  * Kaggle "Factors affecting campus placement" (CC0), 215 students: predict Placed vs Not Placed.
  * UCI Student Performance (CC BY 4.0), 649 students: predict a pass (final grade >= 10 of 20).

Choices made on purpose:
  * Protected attributes (gender/sex) and location or school proxies are NOT used as features.
  * `salary` exists only for placed students, so it would leak the label. It is excluded.
  * The UCI first- and second-period grades (G1, G2) almost give away the final grade, so they are excluded; the
    question asked is "can habits and background predict a pass", not "can last term's grade predict this term's".
  * Accuracy alone misleads on imbalanced data, so a majority-class baseline is reported next to each model.
  * With so few rows, repeated stratified 5-fold cross-validation replaces a single split.

These datasets do not contain the features the app records, so this baseline demonstrates the method and gives a
reference point. It is not the model the app serves.

    python train_baseline.py --placement ../../data/raw/kaggle/placement/Placement_Data_Full_Class.csv \
        --uci ../../data/raw/uci/student-performance/student-performance.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
SCORING = ["accuracy", "f1", "roc_auc"]

PLACEMENT_NUMERIC = ["ssc_p", "hsc_p", "degree_p", "etest_p", "mba_p"]
UCI_NUMERIC = [
    "age", "Medu", "Fedu", "traveltime", "studytime", "failures", "famrel",
    "freetime", "goout", "Dalc", "Walc", "health", "absences",
]  # fmt: skip
UCI_YES_NO = ["higher", "internet", "schoolsup", "famsup", "paid", "activities"]


def load_placement(path: Path) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(path)
    X = df[PLACEMENT_NUMERIC].copy()
    X["workex"] = (df["workex"] == "Yes").astype(int)
    X["specialisation_mkt_fin"] = (df["specialisation"] == "Mkt&Fin").astype(int)
    return X, (df["status"] == "Placed").astype(int)


def load_uci(path: Path) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(path)
    X = df[UCI_NUMERIC].copy()
    for col in UCI_YES_NO:
        X[col] = (df[col] == "yes").astype(int)
    return X, (df["G3"] >= 10).astype(int)


def models() -> dict:
    return {
        "majority_class (reference)": DummyClassifier(strategy="most_frequent"),
        "logistic_regression": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
            ]
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=300,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=SEED,
            n_jobs=-1,
        ),
    }


def evaluate(X: pd.DataFrame, y: pd.Series, repeats: int = 3) -> dict:
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=SEED)
    out = {}
    for name, model in models().items():
        scores = cross_validate(model, X, y, cv=cv, scoring=SCORING, n_jobs=1)
        out[name] = {
            m: {
                "mean": round(float(np.mean(scores[f"test_{m}"])), 4),
                "std": round(float(np.std(scores[f"test_{m}"])), 4),
            }
            for m in SCORING
        }
    return {
        "rows": len(X),
        "features": list(X.columns),
        "positive_rate": round(float(y.mean()), 4),
        "cv": f"{cv.get_n_splits() // repeats}-fold x {repeats} repeats, stratified",
        "models": out,
    }


def run(placement: Path | None, uci: Path | None, repeats: int = 3) -> dict:
    report: dict = {
        "note": "Real-data baseline. Excludes gender/sex and label-leaking columns; not the model the app serves.",
        "datasets": {},
    }
    if placement:
        report["datasets"]["kaggle_campus_placement"] = evaluate(
            *load_placement(placement), repeats
        )
    if uci:
        report["datasets"]["uci_student_performance"] = evaluate(*load_uci(uci), repeats)
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--placement", type=Path)
    p.add_argument("--uci", type=Path)
    p.add_argument("--out", type=Path, default=Path("models/baseline_metrics.json"))
    p.add_argument("--repeats", type=int, default=3)
    args = p.parse_args(argv)
    if not (args.placement or args.uci):
        print("give --placement and/or --uci (run `npm run data:fetch` first)")
        return 1

    report = run(args.placement, args.uci, args.repeats)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    for ds, r in report["datasets"].items():
        print(f"\n{ds}: {r['rows']} rows, {r['positive_rate']:.1%} positive ({r['cv']})")
        for name, m in r["models"].items():
            print(
                f"  {name:28s} acc={m['accuracy']['mean']:.3f} f1={m['f1']['mean']:.3f} "
                f"roc_auc={m['roc_auc']['mean']:.3f} (+/-{m['roc_auc']['std']:.3f})"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
