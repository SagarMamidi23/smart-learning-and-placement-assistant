import { z } from "zod";
import { OPPORTUNITY_TYPES, slugSchema, type OpportunityType } from "./domain";

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "shortlisted",
  "rejected",
  "offered",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Links are shown to students as clickable, so only https URLs are accepted (never javascript: or data:). */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => u.startsWith("https://"), "Link must start with https://");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31")
  .refine((d) => !Number.isNaN(Date.parse(d)), "Not a real date");

export const opportunityInputSchema = z.object({
  domain: slugSchema,
  type: z.enum(OPPORTUNITY_TYPES),
  title: z.string().trim().min(3).max(200),
  organisation: z.string().trim().min(2).max(150),
  location: z.string().trim().max(120).default("India"),
  eligibility: z.string().trim().max(800).default(""),
  /** Last date to apply. Leave empty when it varies from year to year. */
  deadline: isoDate.nullable().default(null),
  link: httpsUrl,
  description: z.string().trim().min(20).max(1500),
  isActive: z.boolean().default(true),
});
export type OpportunityInput = z.input<typeof opportunityInputSchema>;

export const opportunityUpdateSchema = opportunityInputSchema.omit({ domain: true }).strict();

export interface OpportunityDto {
  id: string;
  domain: string;
  type: OpportunityType;
  title: string;
  organisation: string;
  location: string;
  eligibility: string;
  deadline: string | null;
  link: string;
  description: string;
  isActive: boolean;
  /** Days until the deadline: negative once it has passed, null when there is none. */
  daysLeft: number | null;
}

export interface MatchDto {
  opportunity: OpportunityDto;
  /** 0-100, how closely the opportunity's description matches the student's profile. */
  match: number;
  /** One or two sentences on why it suits this student, written by the LLM. Null if unavailable. */
  reason: string | null;
  /** Anything the student should double-check against the official notification. */
  caution: string | null;
  application?: { id: string; status: ApplicationStatus };
}

export interface MatchesResponse {
  matches: MatchDto[];
  /** True when embeddings were unavailable and a simple keyword overlap was used for ranking. */
  rankingFallback: boolean;
  /** True when reasons could not be generated (LLM unavailable); matches are still returned. */
  reasonsUnavailable: boolean;
  readiness: { score: number; target: number; met: boolean } | null;
}

// ---- applications ----

export const createApplicationSchema = z
  .object({
    opportunityId: z.string().regex(/^[0-9a-f]{24}$/),
    status: z.enum(APPLICATION_STATUSES).default("saved"),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();

export const updateApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES),
    notes: z.string().trim().max(2000),
    deadlines: z
      .array(z.object({ label: z.string().trim().min(1).max(80), date: isoDate }).strict())
      .max(10),
  })
  .partial()
  .strict();

export interface ApplicationDto {
  id: string;
  status: ApplicationStatus;
  notes: string;
  deadlines: { label: string; date: string }[];
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
  history: { status: ApplicationStatus; at: string }[];
  opportunity: OpportunityDto | null;
}

export interface AlertDto {
  kind: "deadline" | "custom" | "overdue";
  /** What is due, in words. */
  message: string;
  date: string;
  daysLeft: number;
  applicationId: string;
  opportunityTitle: string;
}
