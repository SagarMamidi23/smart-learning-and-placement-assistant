"""Serving-side model wrapper: a 0-100 readiness score plus the factors that moved it."""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd

from app.features import FEATURES, LABELS


class Predictor:
    def __init__(self, artifact: dict):
        self.model = artifact["model"]
        self.means: dict[str, float] = artifact["means"]
        self.version: str = artifact["model_version"]
        self.metrics: dict = artifact["metrics"]
        if artifact["features"] != FEATURES:
            raise ValueError("model was trained on a different feature set; retrain it")

    @classmethod
    def load(cls, path: str | Path) -> Predictor:
        return cls(joblib.load(path))

    def _proba(self, frame: pd.DataFrame) -> float:
        return float(self.model.predict_proba(frame[FEATURES])[0, 1])

    def predict(self, features: dict[str, float], top_n: int = 3) -> dict:
        row = pd.DataFrame([{f: float(features[f]) for f in FEATURES}])
        p = self._proba(row)

        # Occlusion: how many score points would change if this one signal were typical (the training mean)?
        # Works for any model, so the explanation stays correct if the selected model type changes.
        factors = []
        for f in FEATURES:
            typical = row.copy()
            typical.loc[0, f] = self.means[f]
            impact = (p - self._proba(typical)) * 100
            factors.append(
                {
                    "feature": f,
                    "label": LABELS[f],
                    "value": float(row.loc[0, f]),
                    "typical": round(self.means[f], 1),
                    "impact": round(impact, 1),
                    "direction": "raises" if impact >= 0 else "lowers",
                }
            )
        factors.sort(key=lambda x: abs(x["impact"]), reverse=True)
        return {
            "score": round(p * 100, 1),
            "model_version": self.version,
            "top_factors": factors[:top_n],
        }
