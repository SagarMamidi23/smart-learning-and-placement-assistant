import { describe, expect, it } from "vitest";
import { domainConfigSchema, domainUpdateSchema } from "@slp/shared";
import type { DomainDetail } from "./hooks";
import {
  describeIssue,
  emptyForm,
  parseMonths,
  sumPct,
  toForm,
  toPayload,
  type DomainForm,
} from "./domainForm";

const detail: DomainDetail = {
  slug: "law",
  name: "Law",
  description: "Legal careers and judicial services.",
  benchmarkSkills: [
    { name: "Constitutional Law", level: 4, weight: 0.5, category: "core", source: "curated" },
    { name: "Drafting", level: 3, weight: 0.3, category: "core", source: "curated" },
    { name: "Critical Thinking", level: 4, weight: 0.2, category: "skill", source: "onet" },
  ],
  assessmentTypes: ["mcq", "answer-writing"],
  mockEvaluation: {
    type: "practical-task",
    rubric: [
      { criterion: "Issue spotting", weight: 0.6, description: "Finds the issues" },
      { criterion: "Drafting", weight: 0.4 },
    ],
  },
  readinessTarget: 70,
  opportunityTypes: ["exam", "job"],
  examCalendar: [
    { name: "CLAT", months: [12], notes: "December" },
    { name: "AIBE", months: [] },
  ],
  safetyNotice: "Exam and career preparation only, not professional legal advice.",
  isActive: true,
};

describe("domain form conversion", () => {
  it("round-trips a domain through the form without changing it", () => {
    const { updatedAt: _u, ...expected } = { ...detail, updatedAt: undefined };
    const parsed = domainUpdateSchema.parse(toPayload(toForm(detail), "edit"));
    const { slug: _s, ...rest } = expected;
    expect(parsed).toEqual(rest);
  });

  it("shows weights as percentages and stores them as fractions", () => {
    const form = toForm(detail);
    expect(form.skills.map((s) => s.weight)).toEqual(["50", "30", "20"]);
    expect(toPayload(form, "edit").benchmarkSkills.map((s) => s.weight)).toEqual([0.5, 0.3, 0.2]);
  });

  it("includes the slug on create only", () => {
    const form = { ...toForm(detail), slug: "new-one" };
    expect(toPayload(form, "create")).toHaveProperty("slug", "new-one");
    expect(toPayload(form, "edit")).not.toHaveProperty("slug");
  });

  it("sends blank optional text as undefined", () => {
    const form: DomainForm = { ...toForm(detail), safetyNotice: "  " };
    expect(toPayload(form, "edit").safetyNotice).toBeUndefined();
  });

  it("parses months and flags bad tokens", () => {
    expect(parseMonths("2, 11")).toEqual([2, 11]);
    expect(parseMonths("")).toEqual([]);
    expect(parseMonths("2 x")[1]).toBeNaN();
  });

  it("sums percentages", () => {
    expect(sumPct([{ weight: "33.3" }, { weight: "66.7" }, { weight: "" }])).toBe(100);
  });

  it("the blank form is a valid starting point once names are filled in", () => {
    const form = emptyForm();
    form.slug = "my-domain";
    form.name = "My Domain";
    form.description = "A description that is long enough.";
    form.skills.forEach((s, i) => (s.name = `Skill ${i}`));
    form.rubric.forEach((r, i) => (r.criterion = `Criterion ${i}`));
    expect(domainConfigSchema.safeParse(toPayload(form, "create")).success).toBe(true);
  });

  it("describes validation issues in terms the editor shows", () => {
    expect(describeIssue(["benchmarkSkills", 2, "name"], "Required")).toBe(
      "Skill 3 › name: Required",
    );
    expect(describeIssue(["mockEvaluation", "rubric"], "Weights must sum to 1")).toBe(
      "mockEvaluation › rubric: Weights must sum to 1",
    );
    expect(describeIssue([], "Oops")).toBe("Form: Oops");
  });
});
