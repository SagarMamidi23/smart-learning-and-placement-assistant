"""Generate a labelled synthetic dataset of student readiness.

WHY SYNTHETIC: the app has no real outcome data yet. This dataset lets the readiness model be trained, tested and
served end to end. It does NOT validate the model against real placement outcomes. See "Retraining" in the README
for how real data replaces it.

ASSUMPTIONS (every one is a modelling choice, not a measurement):
  1. Each student has two hidden traits, aptitude and diligence (standard normal, correlation 0.3), and a
     journey stage in [0, 1] (how far through the platform they are).
  2. "Ready" (the label) is driven by those hidden traits and the stage, through a logistic function:
         P(ready) = sigmoid(1.6*aptitude + 0.8*diligence + 2.4*(stage - 0.5) - 0.2)
     The label is then drawn at random from that probability, so identical students can have different outcomes.
  3. The app never sees the hidden traits. It sees noisy signals that depend on them:
       assessment_avg, mock_eval_avg      tests taken only with probability that rises with stage (otherwise 0)
       path_completion_pct                rises with stage and diligence
       skill_gap_coverage_pct             rises with aptitude and stage
       mentor_engagement                  Poisson count, higher with stage and diligence, capped at 50
       days_active                        Binomial over 30 days, higher with stage and diligence
       recency_days                       days since last activity; short for engaged students, 60 when inactive
  4. A student with no assessment or mock evaluation has 0 for it (missing evidence is treated as no evidence).
  5. About 45% of students are labelled ready.

Because the label comes from a known formula, a good model will recover it well. High scores on this data say the
pipeline works, not that readiness is this predictable in reality.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from app.features import FEATURES

DEFAULT_ROWS = 6000
SEED = 42


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def generate(n: int = DEFAULT_ROWS, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    aptitude = rng.standard_normal(n)
    diligence = 0.3 * aptitude + np.sqrt(1 - 0.3**2) * rng.standard_normal(n)
    stage = rng.uniform(0, 1, n)

    p_ready = sigmoid(1.6 * aptitude + 0.8 * diligence + 2.4 * (stage - 0.5) - 0.2)
    ready = rng.binomial(1, p_ready)

    did_assessment = rng.uniform(size=n) < (0.3 + 0.7 * stage)
    did_mock = rng.uniform(size=n) < (0.2 + 0.6 * stage)
    assessment = np.clip(55 + 15 * aptitude + 6 * diligence + rng.normal(0, 8, n), 0, 100)
    mock = np.clip(50 + 14 * aptitude + 8 * diligence + rng.normal(0, 10, n), 0, 100)
    path = np.clip(stage * 80 + 12 * diligence + rng.normal(0, 12, n), 0, 100)
    coverage = np.clip(35 + 12 * aptitude + 25 * stage + rng.normal(0, 8, n), 0, 100)
    mentor = np.minimum(rng.poisson(np.exp(0.8 + 1.4 * stage + 0.25 * diligence)), 50)
    p_active = np.clip(0.08 + 0.6 * stage + 0.08 * diligence, 0.01, 0.99)
    days_active = rng.binomial(30, p_active)
    recency = np.where(
        days_active > 0,
        np.minimum(rng.exponential(3.0 / (0.2 + stage)), 60),
        60,
    )

    df = pd.DataFrame(
        {
            "assessment_avg": np.where(did_assessment, assessment, 0).round(1),
            "mock_eval_avg": np.where(did_mock, mock, 0).round(1),
            "path_completion_pct": path.round(1),
            "skill_gap_coverage_pct": coverage.round(1),
            "mentor_engagement": mentor.astype(int),
            "days_active": days_active.astype(int),
            "recency_days": recency.round(0).astype(int),
            "ready": ready.astype(int),
        }
    )
    assert list(df.columns[:-1]) == FEATURES
    return df


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Generate the synthetic readiness dataset")
    p.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    p.add_argument("--seed", type=int, default=SEED)
    p.add_argument("--out", type=Path, default=Path("data/synthetic_readiness.csv"))
    args = p.parse_args(argv)
    df = generate(args.rows, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"wrote {len(df)} rows to {args.out} (ready rate {df['ready'].mean():.1%})")


if __name__ == "__main__":
    main()
