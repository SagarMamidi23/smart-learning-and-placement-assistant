/** The seven signals the readiness model uses. Names match the ML service (snake_case). */
export interface ReadinessFeatures {
  assessment_avg: number;
  mock_eval_avg: number;
  path_completion_pct: number;
  skill_gap_coverage_pct: number;
  mentor_engagement: number;
  days_active: number;
  recency_days: number;
}

export const READINESS_FEATURE_LABELS: Record<keyof ReadinessFeatures, string> = {
  assessment_avg: "Assessment results",
  mock_eval_avg: "Mock evaluation results",
  path_completion_pct: "Learning path completion",
  skill_gap_coverage_pct: "Skill benchmark coverage",
  mentor_engagement: "AI mentor questions asked (last 30 days)",
  days_active: "Days active (last 30 days)",
  recency_days: "Days since last activity",
};

export interface ReadinessFactor {
  feature: keyof ReadinessFeatures;
  label: string;
  value: number;
  /** Typical value among students the model learned from (ML model only). */
  typical?: number;
  /** Score points this signal adds (positive) or removes (negative) compared with a typical student. */
  impact: number;
  direction: "raises" | "lowers";
}

export interface ReadinessNextAction {
  label: string;
  href: string;
}

export interface ReadinessResultDto {
  id: string;
  domain: string;
  /** 0-100. Higher means closer to job-ready, as estimated by the model. */
  score: number;
  target: number;
  /** At or above target: look at opportunities. Below: go back to the learning path. */
  decision: "opportunities" | "learning";
  modelVersion: string;
  /** True when the ML service was unavailable and a simple weighted formula was used instead. */
  isFallback: boolean;
  createdAt: string;
  features: ReadinessFeatures;
  factors: ReadinessFactor[];
  /** Which kinds of evidence exist. A score built on little evidence is flagged in the UI. */
  evidence: {
    assessments: boolean;
    mockEvaluations: boolean;
    learningPath: boolean;
    skillGap: boolean;
    mentor: boolean;
  };
  focusAreas: { skill: string; priority: string; currentLevel: number; targetLevel: number }[];
  nextActions: ReadinessNextAction[];
}

export interface ReadinessHistoryPoint {
  id: string;
  score: number;
  isFallback: boolean;
  modelVersion: string;
  createdAt: string;
}
