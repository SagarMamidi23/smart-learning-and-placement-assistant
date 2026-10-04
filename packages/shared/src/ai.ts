import { z } from "zod";

// ---- Career discovery ----

export interface QuizOption {
  value: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  type: "likert" | "choice" | "text";
  text: string;
  /** Required for `choice`. Likert answers are integers 1 (strongly disagree) to 5 (strongly agree). */
  options?: QuizOption[];
  required: boolean;
}

export interface QuizDefinition {
  version: number;
  questions: QuizQuestion[];
}

export const quizSubmitSchema = z
  .object({ answers: z.record(z.string().max(60), z.union([z.string().max(600), z.number()])) })
  .strict();
export type QuizSubmitInput = z.infer<typeof quizSubmitSchema>;

export interface DiscoveryRecommendation {
  slug: string;
  reason: string;
  matchScore: number;
  strengths: string[];
}

export interface DiscoveryResultDto {
  generatedAt: string;
  quizVersion: number;
  summary: string;
  recommendations: DiscoveryRecommendation[];
}

// ---- Skill gap ----

export const GAP_PRIORITIES = ["high", "medium", "low"] as const;
export type GapPriority = (typeof GAP_PRIORITIES)[number];

export interface SkillGapDto {
  id: string;
  domain: string;
  generatedAt: string;
  /** Weighted share (0-100) of the domain's benchmark that the profile already meets. */
  coverage: number;
  summary: string;
  usedResume: boolean;
  strengths: { skill: string; currentLevel: number; targetLevel: number; evidence: string }[];
  gaps: {
    skill: string;
    currentLevel: number;
    targetLevel: number;
    priority: GapPriority;
  }[];
}

// ---- Learning path ----

export const RESOURCE_TYPES = [
  "course",
  "book",
  "practice",
  "video",
  "article",
  "project",
] as const;
export const WEEK_STATUSES = ["not-started", "in-progress", "done"] as const;

export const generatePathSchema = z
  .object({
    weeks: z.number().int().min(2).max(16).default(8),
    hoursPerWeek: z.number().int().min(1).max(40).default(8),
  })
  .partial()
  .strict();
export type GeneratePathInput = z.infer<typeof generatePathSchema>;

export const goalProgressSchema = z
  .object({
    week: z.number().int().min(1).max(16),
    goalIndex: z.number().int().min(0).max(20),
    done: z.boolean(),
  })
  .strict();
export type GoalProgressInput = z.infer<typeof goalProgressSchema>;

export interface LearningPathDto {
  id: string;
  domain: string;
  version: number;
  generatedAt: string;
  hoursPerWeek: number;
  /** True when a newer skill-gap report exists, so the plan no longer matches the student's gaps. */
  stale: boolean;
  completionPct: number;
  weeks: {
    week: number;
    title: string;
    status: (typeof WEEK_STATUSES)[number];
    goals: { text: string; done: boolean }[];
    topics: string[];
    resources: { title: string; type: (typeof RESOURCE_TYPES)[number]; provider?: string }[];
    focusSkills: string[];
  }[];
}
