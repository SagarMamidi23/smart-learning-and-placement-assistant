import type { ApplicationStatus } from "./opportunity";

/** Cohort-level numbers for administrators. Never contains a name, email or any per-student record. */
export interface AnalyticsDto {
  generatedAt: string;
  /** "Active" and "in window" figures cover this many days. */
  windowDays: number;
  users: {
    students: number;
    admins: number;
    newStudents: number;
    /** Students who did anything in a tracked module during the window. */
    activeStudents: number;
  };
  domains: DomainAnalytics[];
  modules: ModuleUsage[];
  readiness: {
    /** Students with at least one readiness score. */
    scored: number;
    /** Scores produced by the fallback formula instead of the ML model (latest per student and domain). */
    fallbackScores: number;
  };
  assessments: { id: string; title: string; domain: string; attempts: number; avgScore: number }[];
  applications: { total: number; byStatus: Record<ApplicationStatus, number> };
  opportunities: { total: number; active: number; missingVectors: number };
}

export interface DomainAnalytics {
  slug: string;
  name: string;
  /** Students whose active domain this is. */
  students: number;
  /** Students with a readiness score in this domain (latest per student). */
  scored: number;
  avgReadiness: number | null;
  target: number;
  atOrAboveTarget: number;
  /** Null when nobody is scored, so the chart shows a gap rather than a misleading 0. */
  pctAtOrAboveTarget: number | null;
}

export interface ModuleUsage {
  key:
    | "skill_gap"
    | "learning_path"
    | "mentor"
    | "assessments"
    | "mock_eval"
    | "readiness"
    | "applications";
  label: string;
  /** All-time records and distinct students who ever used it. */
  total: number;
  users: number;
  /** Within the window. */
  recent: number;
  recentUsers: number;
}
