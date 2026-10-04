import { Types } from "mongoose";
import type { ReadinessFeatures } from "@slp/shared";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { LearningPath, completionPct } from "../models/LearningPath";
import { MentorChat } from "../models/MentorChat";
import { MockEvaluation } from "../models/MockEvaluation";
import { SkillGapReport } from "../models/SkillGapReport";

const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;
export const MAX_RECENCY = 60;
export const MAX_MENTOR = 50;

export interface Evidence {
  assessments: boolean;
  mockEvaluations: boolean;
  learningPath: boolean;
  skillGap: boolean;
  mentor: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/**
 * Turns what the student has done in one domain into the model's seven signals. Missing evidence counts as 0
 * (no tests taken means no test results to credit), matching how the model was trained.
 */
export async function extractFeatures(
  userId: string,
  domain: string,
  now: Date = new Date(),
): Promise<{ features: ReadinessFeatures; evidence: Evidence }> {
  const uid = new Types.ObjectId(userId);
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const attempts = await AssessmentAttempt.find({ userId: uid, domain, status: "submitted" })
    .select("assessmentId score submittedAt")
    .lean();
  const evals = await MockEvaluation.find({ userId: uid, domain, status: "completed" })
    .select("overallScore completedAt")
    .lean();
  const path = await LearningPath.findOne({ userId: uid, domain }).sort({ version: -1 });
  const report = await SkillGapReport.findOne({ userId: uid, domain }).sort({ createdAt: -1 });
  const chat = await MentorChat.findOne({ userId: uid, domain }).lean();

  // Best score per distinct assessment, so retaking a test improves the average rather than diluting it.
  const best = new Map<string, number>();
  for (const a of attempts) {
    const id = String(a.assessmentId);
    best.set(id, Math.max(best.get(id) ?? 0, a.score ?? 0));
  }
  const mentorTimes = (chat?.messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.createdAt);

  const activity: Date[] = [
    ...attempts.flatMap((a) => (a.submittedAt ? [a.submittedAt] : [])),
    ...evals.flatMap((e) => (e.completedAt ? [e.completedAt] : [])),
    ...mentorTimes,
    ...(report ? [report.createdAt] : []),
    ...(path ? [path.createdAt, path.updatedAt] : []),
  ];
  const days = new Set(activity.filter((d) => d >= since && d <= now).map(utcDay));
  const last = activity.length ? Math.max(...activity.map((d) => d.getTime())) : null;
  const recency =
    last === null
      ? MAX_RECENCY
      : Math.min(MAX_RECENCY, Math.max(0, utcDay(now) - utcDay(new Date(last))));

  return {
    features: {
      assessment_avg: round1(mean([...best.values()])),
      mock_eval_avg: round1(mean(evals.map((e) => e.overallScore ?? 0))),
      path_completion_pct: path ? Math.min(100, completionPct(path.weeks as never)) : 0,
      skill_gap_coverage_pct: report ? Math.min(100, report.coverage) : 0,
      mentor_engagement: Math.min(MAX_MENTOR, mentorTimes.filter((d) => d >= since).length),
      days_active: Math.min(WINDOW_DAYS, days.size),
      recency_days: recency,
    },
    evidence: {
      assessments: best.size > 0,
      mockEvaluations: evals.length > 0,
      learningPath: Boolean(path),
      skillGap: Boolean(report),
      mentor: mentorTimes.length > 0,
    },
  };
}
