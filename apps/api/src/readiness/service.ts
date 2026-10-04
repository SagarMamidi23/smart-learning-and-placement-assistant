import type { ReadinessFeatures, ReadinessNextAction, ReadinessResultDto } from "@slp/shared";
import { readinessComputations } from "../metrics";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { SkillGapReport } from "../models/SkillGapReport";
import { extractFeatures, type Evidence } from "./features";
import { FALLBACK_VERSION, fallbackScore } from "./fallback";
import { getPredictor } from "./mlClient";

const REUSE_WITHIN_MS = 60_000;
const sameFeatures = (a: ReadinessFeatures, b: ReadinessFeatures) =>
  (Object.keys(a) as (keyof ReadinessFeatures)[]).every((k) => a[k] === b[k]);

/** The next steps that would raise this student's score, most useful first. Rule-based, so always available. */
export function nextActionsFor(
  f: ReadinessFeatures,
  e: Evidence,
  decision: ReadinessResultDto["decision"],
): ReadinessNextAction[] {
  if (decision === "opportunities") {
    return [{ label: "Browse opportunities that match your profile", href: "/opportunities" }];
  }
  const actions: ReadinessNextAction[] = [];
  if (!e.skillGap) actions.push({ label: "Analyse your skill gaps", href: "/skill-gap" });
  if (!e.learningPath)
    actions.push({ label: "Generate your learning path", href: "/learning-path" });
  else if (f.path_completion_pct < 60) {
    actions.push({ label: "Keep working through your learning path", href: "/learning-path" });
  }
  if (!e.assessments) actions.push({ label: "Take an assessment", href: "/assessments" });
  else if (f.assessment_avg < 70) {
    actions.push({ label: "Retake assessments to raise your best scores", href: "/assessments" });
  }
  if (!e.mockEvaluations) actions.push({ label: "Do a mock evaluation", href: "/mock-eval" });
  else if (f.mock_eval_avg < 65)
    actions.push({ label: "Practise another mock evaluation", href: "/mock-eval" });
  if (f.days_active < 8) {
    actions.push({ label: "Study on more days: regular practice counts", href: "/learning-path" });
  }
  if (!e.mentor)
    actions.push({ label: "Ask the AI mentor about a topic you find hard", href: "/mentor" });
  return actions.slice(0, 4);
}

type SnapshotDoc = {
  _id: unknown;
  domain: string;
  score: number;
  target: number;
  decision: "opportunities" | "learning";
  modelVersion: string;
  isFallback?: boolean | null;
  createdAt: Date;
  features: ReadinessFeatures;
  factors?: unknown[];
  evidence?: unknown;
  userId: unknown;
};

/** Builds the full response for a snapshot, with focus areas from the student's latest skill-gap report. */
export async function describeSnapshot(raw: unknown): Promise<ReadinessResultDto> {
  const s = JSON.parse(JSON.stringify(raw)) as SnapshotDoc & { _id: string };
  const evidence = s.evidence as Evidence;
  const report = await SkillGapReport.findOne({
    userId: s.userId as string,
    domain: s.domain,
  }).sort({
    createdAt: -1,
  });
  return {
    id: String(s._id),
    domain: s.domain,
    score: s.score,
    target: s.target,
    decision: s.decision,
    modelVersion: s.modelVersion,
    isFallback: Boolean(s.isFallback),
    createdAt: s.createdAt as unknown as string,
    features: s.features,
    factors: (s.factors ?? []) as ReadinessResultDto["factors"],
    evidence,
    focusAreas:
      s.decision === "learning" && report
        ? report.gaps.slice(0, 3).map((g) => ({
            skill: g.skill,
            priority: g.priority,
            currentLevel: g.currentLevel,
            targetLevel: g.targetLevel,
          }))
        : [],
    nextActions: nextActionsFor(s.features, evidence, s.decision),
  };
}

/**
 * Computes the student's readiness for a domain: gather the signals, ask the ML service, fall back to the weighted
 * formula if it is unavailable, store a snapshot, and decide what happens next (opportunities or more learning).
 * Asking twice within a minute with nothing changed returns the existing snapshot instead of cluttering the history.
 */
export async function computeReadiness(args: {
  userId: string;
  domain: { slug: string; readinessTarget: number };
  now?: Date;
}): Promise<ReadinessResultDto> {
  const now = args.now ?? new Date();
  const { features, evidence } = await extractFeatures(args.userId, args.domain.slug, now);

  const latest = await ReadinessSnapshot.findOne({
    userId: args.userId,
    domain: args.domain.slug,
  }).sort({
    createdAt: -1,
  });
  if (
    latest &&
    now.getTime() - latest.createdAt.getTime() < REUSE_WITHIN_MS &&
    sameFeatures(latest.features as unknown as ReadinessFeatures, features)
  ) {
    return describeSnapshot(latest);
  }

  const ml = await getPredictor().predict(features);
  const fb = ml ? null : fallbackScore(features);
  readinessComputations.inc({ source: ml ? "ml" : "fallback" });

  const score = ml ? ml.score : fb!.score;
  const snapshot = await ReadinessSnapshot.create({
    userId: args.userId,
    domain: args.domain.slug,
    features,
    score,
    modelVersion: ml ? ml.modelVersion : FALLBACK_VERSION,
    isFallback: !ml,
    factors: ml ? ml.factors : fb!.factors,
    target: args.domain.readinessTarget,
    decision: score >= args.domain.readinessTarget ? "opportunities" : "learning",
    evidence,
  });
  return describeSnapshot(snapshot);
}
