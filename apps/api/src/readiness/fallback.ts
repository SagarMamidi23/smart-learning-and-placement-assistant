import {
  READINESS_FEATURE_LABELS,
  type ReadinessFactor,
  type ReadinessFeatures,
} from "@slp/shared";

/** Weights sum to 1. A transparent stand-in for the ML model, used only when the ML service is unreachable. */
export const FALLBACK_WEIGHTS: Record<keyof ReadinessFeatures, number> = {
  assessment_avg: 0.28,
  mock_eval_avg: 0.22,
  path_completion_pct: 0.15,
  skill_gap_coverage_pct: 0.15,
  mentor_engagement: 0.05,
  days_active: 0.1,
  recency_days: 0.05,
};

export const FALLBACK_VERSION = "fallback-weighted-v1";

/** Each signal on a 0-1 scale, where 1 is best. Saturating signals reach 1 well below their maximum. */
export function normalise(f: ReadinessFeatures): Record<keyof ReadinessFeatures, number> {
  const unit = (v: number) => Math.min(1, Math.max(0, v));
  return {
    assessment_avg: unit(f.assessment_avg / 100),
    mock_eval_avg: unit(f.mock_eval_avg / 100),
    path_completion_pct: unit(f.path_completion_pct / 100),
    skill_gap_coverage_pct: unit(f.skill_gap_coverage_pct / 100),
    mentor_engagement: unit(f.mentor_engagement / 20),
    days_active: unit(f.days_active / 15),
    recency_days: unit(1 - f.recency_days / 30),
  };
}

export function fallbackScore(f: ReadinessFeatures) {
  const n = normalise(f);
  const keys = Object.keys(FALLBACK_WEIGHTS) as (keyof ReadinessFeatures)[];
  const score = keys.reduce((s, k) => s + FALLBACK_WEIGHTS[k] * n[k], 0) * 100;

  // Impact relative to a neutral student who sits at 0.5 on every signal.
  const factors: ReadinessFactor[] = keys
    .map((k) => {
      const impact = Math.round(FALLBACK_WEIGHTS[k] * (n[k] - 0.5) * 1000) / 10;
      return {
        feature: k,
        label: READINESS_FEATURE_LABELS[k],
        value: f[k],
        impact,
        direction: impact >= 0 ? ("raises" as const) : ("lowers" as const),
      };
    })
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 3);

  return { score: Math.round(score * 10) / 10, factors };
}
