"""The features the app records for each student, shared by training and serving."""

from __future__ import annotations

# name -> (label shown to students, lowest valid value, highest valid value)
FEATURE_SPECS: dict[str, tuple[str, float, float]] = {
    "assessment_avg": ("Assessment results", 0, 100),
    "mock_eval_avg": ("Mock evaluation results", 0, 100),
    "path_completion_pct": ("Learning path completion", 0, 100),
    "skill_gap_coverage_pct": ("Skill benchmark coverage", 0, 100),
    "mentor_engagement": ("AI mentor questions asked (last 30 days)", 0, 50),
    "days_active": ("Days active (last 30 days)", 0, 30),
    "recency_days": ("Days since last activity", 0, 60),
}

FEATURES: list[str] = list(FEATURE_SPECS)
LABELS: dict[str, str] = {k: v[0] for k, v in FEATURE_SPECS.items()}

# Direction each signal is allowed to push the score. More of a positive signal can never lower it, and more days
# since the last activity can never raise it. The served model must respect this so explanations make sense.
MONOTONE: dict[str, int] = {name: 1 for name in FEATURES}
MONOTONE["recency_days"] = -1
