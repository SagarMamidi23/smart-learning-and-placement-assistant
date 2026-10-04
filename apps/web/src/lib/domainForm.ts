import type { DomainConfigInput, DomainUpdateInput } from "@slp/shared";
import type { DomainDetail } from "./hooks";

/**
 * Editor state. Everything the user types is a string, and weights are shown as percentages, so
 * conversion to and from the API shape lives here where it can be tested.
 */
export interface DomainForm {
  slug: string;
  name: string;
  description: string;
  readinessTarget: string;
  isActive: boolean;
  safetyNotice: string;
  assessmentTypes: string[];
  opportunityTypes: string[];
  mockType: "interview" | "practical-task";
  rubric: { criterion: string; weight: string; description: string }[];
  skills: { name: string; level: string; weight: string; category: string; source: string }[];
  exams: { name: string; months: string; notes: string }[];
}

export const emptyForm = (): DomainForm => ({
  slug: "",
  name: "",
  description: "",
  readinessTarget: "70",
  isActive: true,
  safetyNotice: "",
  assessmentTypes: ["mcq"],
  opportunityTypes: ["job"],
  mockType: "interview",
  rubric: [
    { criterion: "", weight: "50", description: "" },
    { criterion: "", weight: "50", description: "" },
  ],
  skills: [
    { name: "", level: "3", weight: "34", category: "core", source: "curated" },
    { name: "", level: "3", weight: "33", category: "core", source: "curated" },
    { name: "", level: "3", weight: "33", category: "core", source: "curated" },
  ],
  exams: [],
});

const pct = (n: number) => String(Math.round(n * 1000) / 10);

export const toForm = (d: DomainDetail): DomainForm => ({
  slug: d.slug,
  name: d.name,
  description: d.description,
  readinessTarget: String(d.readinessTarget),
  isActive: d.isActive,
  safetyNotice: d.safetyNotice ?? "",
  assessmentTypes: [...d.assessmentTypes],
  opportunityTypes: [...d.opportunityTypes],
  mockType: d.mockEvaluation.type,
  rubric: d.mockEvaluation.rubric.map((r) => ({
    criterion: r.criterion,
    weight: pct(r.weight),
    description: r.description ?? "",
  })),
  skills: d.benchmarkSkills.map((s) => ({
    name: s.name,
    level: String(s.level),
    weight: pct(s.weight),
    category: s.category,
    source: s.source,
  })),
  exams: d.examCalendar.map((e) => ({
    name: e.name,
    months: e.months.join(", "),
    notes: e.notes ?? "",
  })),
});

/** "2, 11" -> [2, 11]. Bad tokens become NaN so schema validation reports them. */
export const parseMonths = (s: string): number[] =>
  s
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? Number(t) : NaN));

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const fromPct = (s: string) => Math.round(num(s) * 10) / 1000;
const opt = (s: string) => (s.trim() === "" ? undefined : s.trim());

export function toPayload(f: DomainForm, mode: "create"): DomainConfigInput;
export function toPayload(f: DomainForm, mode: "edit"): DomainUpdateInput;
export function toPayload(f: DomainForm, mode: "create" | "edit"): unknown {
  const body = {
    name: f.name,
    description: f.description,
    benchmarkSkills: f.skills.map((s) => ({
      name: s.name,
      level: num(s.level),
      weight: fromPct(s.weight),
      category: s.category,
      source: s.source,
    })),
    assessmentTypes: f.assessmentTypes,
    mockEvaluation: {
      type: f.mockType,
      rubric: f.rubric.map((r) => ({
        criterion: r.criterion,
        weight: fromPct(r.weight),
        description: opt(r.description),
      })),
    },
    readinessTarget: num(f.readinessTarget),
    opportunityTypes: f.opportunityTypes,
    examCalendar: f.exams.map((e) => ({
      name: e.name,
      months: parseMonths(e.months),
      notes: opt(e.notes),
    })),
    safetyNotice: opt(f.safetyNotice),
    isActive: f.isActive,
  };
  return mode === "create" ? { slug: f.slug, ...body } : body;
}

export const sumPct = (rows: { weight: string }[]) =>
  Math.round(rows.reduce((s, r) => s + (num(r.weight) || 0), 0) * 10) / 10;

const LABELS: Record<string, string> = {
  benchmarkSkills: "Skill",
  rubric: "Rubric row",
  examCalendar: "Exam",
};

/** Turns a Zod issue path like ["benchmarkSkills", 2, "name"] into "Skill 3 › name". */
export function describeIssue(path: (string | number)[], message: string): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const next = path[i + 1];
    if (typeof p === "string" && LABELS[p] && typeof next === "number") {
      parts.push(`${LABELS[p]} ${next + 1}`);
      i++;
    } else if (typeof p === "string") {
      parts.push(p);
    }
  }
  return `${parts.join(" › ") || "Form"}: ${message}`;
}
