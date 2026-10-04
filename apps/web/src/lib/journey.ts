"use client";

import type {
  AlertDto,
  AssessmentSummaryDto,
  LearningPathDto,
  ReadinessResultDto,
  SkillGapDto,
  StudentProfileDto,
} from "@slp/shared";
import { useLearningPath, useSkillGap } from "./aiHooks";
import { useAssessments, useMockEvals } from "./evalHooks";
import { useProfile } from "./hooks";
import { useAlerts, useApplications } from "./opportunityHooks";
import { useReadiness } from "./readinessHooks";

export type StepKey =
  | "profile"
  | "discovery"
  | "domain"
  | "skill-gap"
  | "learning-path"
  | "assessment"
  | "mock-eval"
  | "readiness"
  | "opportunities";

export interface JourneyStep {
  key: StepKey;
  /** Short name for the step strip and the sidebar. */
  name: string;
  href: string;
  done: boolean;
  /** One-line state shown under the step number, e.g. "Done", "38%, ongoing". */
  status: string;
  /** 0-100 when the step is long-running and partly done; drawn as a partial bar. */
  progress?: number;
}

/** The "next best action" card for a step: what to do, why, and the button label. */
export interface NextAction {
  title: string;
  reason: string;
  action: string;
}

const NEXT_ACTIONS: Record<StepKey, NextAction> = {
  profile: {
    title: "Complete your profile",
    reason:
      "Add your education and skills, and optionally a resume. Everything after this, from domain matching to the skill-gap report, starts from your profile.",
    action: "Open my profile",
  },
  discovery: {
    title: "Take the career discovery quiz",
    reason:
      "A short questionnaire about what you enjoy and how you work. It suggests the career domains that fit you best.",
    action: "Start the quiz",
  },
  domain: {
    title: "Choose a career domain",
    reason:
      "Your domain sets the skill benchmark, the learning path and the readiness target, so it unlocks most of the next steps.",
    action: "Browse domains",
  },
  "skill-gap": {
    title: "Analyse your skill gaps",
    reason:
      "Compares your profile with your domain's benchmark and lists what to work on first, in priority order.",
    action: "Analyse my skills",
  },
  "learning-path": {
    title: "Generate your learning path",
    reason:
      "Turns your skill gaps into a week-by-week plan with goals and free resources, sized to the hours you have.",
    action: "Build my path",
  },
  assessment: {
    title: "Take your first assessment",
    reason:
      "A timed test with explanations. Assessment results are one of the seven readiness signals, so this makes your score meaningful.",
    action: "See assessments",
  },
  "mock-eval": {
    title: "Do your first mock evaluation",
    reason:
      "Practice interview questions marked against a strict rubric. Mock evaluation is one of the seven readiness signals and you have no result yet.",
    action: "Start mock evaluation",
  },
  readiness: {
    title: "Check your career readiness",
    reason:
      "Combines your assessments, mock evaluations, learning progress and activity into one score against your domain's target.",
    action: "Check my readiness",
  },
  opportunities: {
    title: "Find opportunities to track",
    reason:
      "Browse internships, jobs and exams for your domain, and track deadlines in one place. Confirm dates on the official pages.",
    action: "Browse opportunities",
  },
};

export const nextActionFor = (key: StepKey) => NEXT_ACTIONS[key];

/** "In 3 days", "Tomorrow", "Overdue by 2 days". */
export const relativeDays = (n: number) =>
  n < 0
    ? `Overdue by ${-n} day${n === -1 ? "" : "s"}`
    : n === 0
      ? "Today"
      : n === 1
        ? "Tomorrow"
        : `In ${n} days`;

interface JourneyInput {
  profile?: StudentProfileDto | null;
  skillGap?: SkillGapDto | null;
  path?: LearningPathDto | null;
  assessments?: AssessmentSummaryDto[];
  mockCompleted: boolean;
  readiness?: ReadinessResultDto | null;
  applicationCount: number;
}

/** Pure, so it is testable: the same checks the dashboard has always used, grouped into nine steps. */
export function buildJourney(i: JourneyInput): JourneyStep[] {
  const p = i.profile;
  const best = i.assessments?.reduce<number | undefined>(
    (m, a) => (a.bestScore === undefined ? m : Math.max(m ?? 0, a.bestScore)),
    undefined,
  );
  const attempted = !!i.assessments?.some((a) => (a.attempts ?? 0) > 0);
  const r = i.readiness;
  const pathPct = i.path ? Math.round(i.path.completionPct) : undefined;
  return [
    {
      key: "profile",
      name: "Profile",
      href: "/profile",
      done: !!p && (p.skills.length > 0 || p.education.length > 0),
      status: "",
    },
    {
      key: "discovery",
      name: "Discovery quiz",
      href: "/discovery",
      done: !!p?.careerDiscoveryResult,
      status: "",
    },
    {
      key: "domain",
      name: "Domain",
      href: "/domains",
      done: !!p?.activeDomain,
      status: "",
    },
    {
      key: "skill-gap",
      name: "Skill gaps",
      href: "/skill-gap",
      done: !!i.skillGap,
      status: i.skillGap ? `${Math.round(i.skillGap.coverage)}% covered` : "",
    },
    {
      key: "learning-path",
      name: "Learning path",
      href: "/learning-path",
      done: !!i.path,
      status: pathPct !== undefined ? `${pathPct}%, ongoing` : "",
      progress: pathPct,
    },
    {
      key: "assessment",
      name: "Assessment",
      href: "/assessments",
      done: attempted,
      status: attempted && best !== undefined ? `Best ${Math.round(best)}%` : "",
    },
    {
      key: "mock-eval",
      name: "Mock evaluation",
      href: "/mock-eval",
      done: i.mockCompleted,
      status: "",
    },
    {
      // Done once the score reaches the domain's target, not merely once it has been calculated.
      key: "readiness",
      name: "Readiness",
      href: "/readiness",
      done: !!r && r.score >= r.target,
      status: r ? `${Math.round(r.score)}, target ${r.target}` : "",
    },
    {
      key: "opportunities",
      name: "Opportunities",
      href: i.applicationCount ? "/applications" : "/opportunities",
      done: i.applicationCount > 0,
      status: i.applicationCount ? `Tracking ${i.applicationCount}` : "Browse anytime",
    },
  ];
}

/** Loads everything the journey needs. Queries are shared with the pages, so this adds no extra requests there. */
export function useJourney() {
  const profile = useProfile();
  const hasDomain = Boolean(profile.data?.activeDomain);
  const skillGap = useSkillGap(hasDomain);
  const path = useLearningPath(hasDomain);
  const assessments = useAssessments(hasDomain);
  const mocks = useMockEvals(hasDomain);
  const readiness = useReadiness(hasDomain);
  const applications = useApplications(hasDomain);
  const alerts = useAlerts(hasDomain);

  const steps = buildJourney({
    profile: profile.data,
    skillGap: skillGap.data,
    path: path.data,
    assessments: assessments.data,
    mockCompleted: !!mocks.data?.some((m) => m.status === "completed"),
    readiness: readiness.data,
    applicationCount: applications.data?.length ?? 0,
  });
  const nextIndex = steps.findIndex((s) => !s.done);

  return {
    loading: profile.isLoading,
    profile: profile.data,
    path: path.data,
    readiness: readiness.data,
    alerts: alerts.data ?? ([] as AlertDto[]),
    steps,
    doneCount: steps.filter((s) => s.done).length,
    /** -1 when every step is done. */
    nextIndex,
  };
}
