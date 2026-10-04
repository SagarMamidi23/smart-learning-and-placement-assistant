import { z } from "zod";

export const ASSESSMENT_TYPES = [
  "mcq",
  "coding",
  "case-study",
  "answer-writing",
  "demo-lesson",
  "numerical",
  "practical",
] as const;
export const OPPORTUNITY_TYPES = [
  "job",
  "exam",
  "internship",
  "fellowship",
  "apprenticeship",
] as const;
export const MOCK_EVAL_TYPES = ["interview", "practical-task"] as const;
/** core = hand-curated for the domain; skill/knowledge/tool = derived from O*NET. */
export const SKILL_CATEGORIES = ["core", "skill", "knowledge", "tool"] as const;
export const SKILL_SOURCES = ["curated", "onet"] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const slugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,40}$/, "Use lowercase letters, digits and hyphens (2-41 characters)");

export const benchmarkSkillSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Target proficiency for a job-ready candidate: 1 (aware) to 5 (expert). */
  level: z.number().int().min(1).max(5),
  /** Relative importance within the domain. Weights are normalised to sum to 1 by the seed script. */
  weight: z.number().positive().max(1),
  category: z.enum(SKILL_CATEGORIES).default("core"),
  source: z.enum(SKILL_SOURCES).default("curated"),
});

export const rubricCriterionSchema = z.object({
  criterion: z.string().trim().min(1).max(100),
  weight: z.number().positive().max(1),
  description: z.string().trim().max(300).optional(),
});

export const mockEvaluationSchema = z
  .object({
    type: z.enum(MOCK_EVAL_TYPES),
    rubric: z.array(rubricCriterionSchema).min(2).max(10),
  })
  .superRefine((m, ctx) => {
    const total = m.rubric.reduce((s, r) => s + r.weight, 0);
    if (Math.abs(total - 1) > 0.01) {
      ctx.addIssue({
        code: "custom",
        path: ["rubric"],
        message: `Rubric weights must sum to 1 (currently ${total.toFixed(2)})`,
      });
    }
  });

export const examCalendarEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Typical months (1-12) the exam or recruitment cycle runs. Empty when it varies. */
  months: z.array(z.number().int().min(1).max(12)).max(12),
  notes: z.string().trim().max(300).optional(),
});

const domainBaseSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(600),
  benchmarkSkills: z.array(benchmarkSkillSchema).min(3).max(60),
  assessmentTypes: z.array(z.enum(ASSESSMENT_TYPES)).min(1),
  mockEvaluation: mockEvaluationSchema,
  readinessTarget: z.number().min(0).max(100),
  opportunityTypes: z.array(z.enum(OPPORTUNITY_TYPES)).min(1),
  examCalendar: z.array(examCalendarEntrySchema).max(30).default([]),
  /** Shown on mentor and evaluation screens. Required for safety-critical domains (Healthcare, Law). */
  safetyNotice: z.string().trim().min(1).max(300).optional(),
  isActive: z.boolean().default(true),
});

interface Checkable {
  benchmarkSkills: { name: string }[];
  assessmentTypes: string[];
  opportunityTypes: string[];
}

/** Rejects duplicate skill names, assessment types and opportunity types (case-insensitive). */
function withChecks<S extends z.ZodTypeAny>(schema: S): z.ZodEffects<S, z.output<S>, z.input<S>> {
  return schema.superRefine((data, ctx) => {
    const d = data as Checkable;
    const unique = (path: keyof Checkable, values: string[]) => {
      const seen = new Set<string>();
      for (const v of values) {
        const k = v.toLowerCase();
        if (seen.has(k)) {
          ctx.addIssue({ code: "custom", path: [path], message: `Duplicate entry: ${v}` });
          return;
        }
        seen.add(k);
      }
    };
    unique(
      "benchmarkSkills",
      d.benchmarkSkills.map((s) => s.name),
    );
    unique("assessmentTypes", d.assessmentTypes);
    unique("opportunityTypes", d.opportunityTypes);
  }) as z.ZodEffects<S, z.output<S>, z.input<S>>;
}
export const domainConfigSchema = withChecks(domainBaseSchema);
/** The slug is the identity and can't change, so updates carry everything except it. */
export const domainUpdateSchema = withChecks(domainBaseSchema.omit({ slug: true }).strict());

export type DomainConfigInput = z.input<typeof domainBaseSchema>;
export type DomainConfigData = z.output<typeof domainBaseSchema>;
export type DomainUpdateInput = z.input<typeof domainUpdateSchema>;
export type BenchmarkSkill = z.output<typeof benchmarkSkillSchema>;

export const selectDomainSchema = z.object({ slug: slugSchema });

export interface DomainSummary {
  slug: string;
  name: string;
  description: string;
  readinessTarget: number;
  opportunityTypes: OpportunityType[];
  safetyNotice?: string;
  isActive: boolean;
}

export const toDomainSummary = (d: DomainSummary): DomainSummary => ({
  slug: d.slug,
  name: d.name,
  description: d.description,
  readinessTarget: d.readinessTarget,
  opportunityTypes: d.opportunityTypes,
  safetyNotice: d.safetyNotice,
  isActive: d.isActive,
});
