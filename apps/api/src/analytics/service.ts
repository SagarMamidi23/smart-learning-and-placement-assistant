import { APPLICATION_STATUSES } from "@slp/shared";
import type { AnalyticsDto, ApplicationStatus, DomainAnalytics, ModuleUsage } from "@slp/shared";
import { Application } from "../models/Application";
import { Assessment } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { DomainConfig } from "../models/DomainConfig";
import { LearningPath } from "../models/LearningPath";
import { MentorChat } from "../models/MentorChat";
import { MockEvaluation } from "../models/MockEvaluation";
import { Opportunity } from "../models/Opportunity";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { SkillGapReport } from "../models/SkillGapReport";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The two collection calls used here, so every model fits without fighting Mongoose's generics. */
interface Countable {
  countDocuments(filter: object): Promise<number>;
  distinct(field: string, filter: object): Promise<unknown[]>;
}

interface ModuleSpec {
  key: ModuleUsage["key"];
  label: string;
  model: Countable;
  /** Only records that count as real use (a started-but-abandoned attempt is not usage). */
  filter?: Record<string, unknown>;
}

const MODULES: ModuleSpec[] = [
  { key: "skill_gap", label: "Skill-gap analysis", model: SkillGapReport as unknown as Countable },
  { key: "learning_path", label: "Learning path", model: LearningPath as unknown as Countable },
  { key: "mentor", label: "AI mentor chats", model: MentorChat as unknown as Countable },
  {
    key: "assessments",
    label: "Assessments",
    model: AssessmentAttempt as unknown as Countable,
    filter: { status: "submitted" },
  },
  {
    key: "mock_eval",
    label: "Mock evaluations",
    model: MockEvaluation as unknown as Countable,
    filter: { status: "completed" },
  },
  { key: "readiness", label: "Readiness checks", model: ReadinessSnapshot as unknown as Countable },
  {
    key: "applications",
    label: "Tracked applications",
    model: Application as unknown as Countable,
  },
];

const ids = (xs: unknown[]) => xs.map(String);

/**
 * Cohort statistics for the admin dashboard. Everything is an aggregate: counts, averages and shares. Individual students are never
 * returned, so the page can be shown to a wider staff group than the raw data could.
 */
export async function buildAnalytics(now = new Date(), windowDays = 30): Promise<AnalyticsDto> {
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  // ---- modules, and who was active in the window ----
  const activeSet = new Set<string>();
  const modules: ModuleUsage[] = [];
  for (const m of MODULES) {
    const base = m.filter ?? {};
    const recentFilter = { ...base, createdAt: { $gte: since } };
    const [total, users, recent, recentUsers] = await Promise.all([
      m.model.countDocuments(base),
      m.model.distinct("userId", base),
      m.model.countDocuments(recentFilter),
      m.model.distinct("userId", recentFilter),
    ]);
    for (const u of ids(recentUsers)) activeSet.add(u);
    modules.push({
      key: m.key,
      label: m.label,
      total,
      users: users.length,
      recent,
      recentUsers: recentUsers.length,
    });
  }

  // ---- users ----
  const [students, admins, newStudents] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ role: "student", createdAt: { $gte: since } }),
  ]);
  // Only students count as "active"; staff testing a page should not inflate the figure.
  const studentIds = new Set(ids(await User.find({ role: "student" }).distinct("_id")));
  const activeStudents = [...activeSet].filter((id) => studentIds.has(id)).length;

  // ---- readiness by domain: each student's LATEST score per domain ----
  const latest: { _id: string; scores: number; avg: number; atTarget: number; fallback: number }[] =
    await ReadinessSnapshot.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { userId: "$userId", domain: "$domain" },
          score: { $first: "$score" },
          target: { $first: "$target" },
          isFallback: { $first: "$isFallback" },
        },
      },
      {
        $group: {
          _id: "$_id.domain",
          scores: { $sum: 1 },
          avg: { $avg: "$score" },
          atTarget: { $sum: { $cond: [{ $gte: ["$score", "$target"] }, 1, 0] } },
          fallback: { $sum: { $cond: ["$isFallback", 1, 0] } },
        },
      },
    ]);
  const byDomain = new Map(latest.map((r) => [r._id, r]));

  const perDomainStudents: { _id: string; n: number }[] = await StudentProfile.aggregate([
    { $match: { activeDomain: { $ne: null } } },
    { $group: { _id: "$activeDomain", n: { $sum: 1 } } },
  ]);
  const studentsBy = new Map(perDomainStudents.map((r) => [r._id, r.n]));

  const domainDocs = await DomainConfig.find({}).sort({ name: 1 }).lean();
  const domains: DomainAnalytics[] = domainDocs.map((d) => {
    const r = byDomain.get(d.slug);
    return {
      slug: d.slug,
      name: d.name,
      students: studentsBy.get(d.slug) ?? 0,
      scored: r?.scores ?? 0,
      avgReadiness: r ? round1(r.avg) : null,
      target: d.readinessTarget,
      atOrAboveTarget: r?.atTarget ?? 0,
      pctAtOrAboveTarget: r ? Math.round((r.atTarget / r.scores) * 100) : null,
    };
  });
  const scoredStudents = (await ReadinessSnapshot.distinct("userId")).length;

  // ---- assessments: the ten most attempted ----
  const topAttempts: { _id: unknown; attempts: number; avg: number }[] =
    await AssessmentAttempt.aggregate([
      { $match: { status: "submitted", score: { $ne: null } } },
      { $group: { _id: "$assessmentId", attempts: { $sum: 1 }, avg: { $avg: "$score" } } },
      { $sort: { attempts: -1 } },
      { $limit: 10 },
    ]);
  const titles = new Map(
    (await Assessment.find({ _id: { $in: topAttempts.map((t) => t._id) } }).lean()).map((a) => [
      String(a._id),
      a,
    ]),
  );
  const assessments = topAttempts.flatMap((t) => {
    const a = titles.get(String(t._id));
    return a
      ? [
          {
            id: String(t._id),
            title: a.title,
            domain: a.domain,
            attempts: t.attempts,
            avgScore: round1(t.avg),
          },
        ]
      : [];
  });

  // ---- applications and opportunities ----
  const statusRows: { _id: ApplicationStatus; n: number }[] = await Application.aggregate([
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const r of statusRows) if (r._id in byStatus) byStatus[r._id] = r.n;

  const [oppTotal, oppActive, missingVectors] = await Promise.all([
    Opportunity.countDocuments({}),
    Opportunity.countDocuments({ isActive: true }),
    Opportunity.countDocuments({
      $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }],
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    windowDays,
    users: { students, admins, newStudents, activeStudents },
    domains,
    modules,
    readiness: {
      scored: scoredStudents,
      fallbackScores: latest.reduce((s, r) => s + r.fallback, 0),
    },
    assessments,
    applications: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
    },
    opportunities: { total: oppTotal, active: oppActive, missingVectors },
  };
}
