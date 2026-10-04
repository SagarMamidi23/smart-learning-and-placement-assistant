import { describe, expect, it } from "vitest";
import type {
  AssessmentSummaryDto,
  LearningPathDto,
  ReadinessResultDto,
  SkillGapDto,
  StudentProfileDto,
} from "@slp/shared";
import { buildJourney, nextActionFor, relativeDays } from "./journey";

const profile = {
  skills: ["Python"],
  education: [],
  activeDomain: "software",
  careerDiscoveryResult: { top: "software" },
} as unknown as StudentProfileDto;

const done = (steps: ReturnType<typeof buildJourney>) =>
  steps.filter((s) => s.done).map((s) => s.key);

describe("buildJourney", () => {
  it("has nine steps, all open, for a brand-new student", () => {
    const steps = buildJourney({ mockCompleted: false, applicationCount: 0 });
    expect(steps).toHaveLength(9);
    expect(done(steps)).toEqual([]);
    expect(steps.at(-1)).toMatchObject({ href: "/opportunities", status: "Browse anytime" });
  });

  it("marks steps done with the same checks the dashboard used, and shows their state", () => {
    const steps = buildJourney({
      profile,
      skillGap: { coverage: 58.2 } as SkillGapDto,
      path: { completionPct: 38 } as LearningPathDto,
      assessments: [
        { bestScore: 61, attempts: 1 },
        { bestScore: 74, attempts: 2 },
        { attempts: 0 },
      ] as AssessmentSummaryDto[],
      mockCompleted: false,
      readiness: { score: 62, target: 70 } as ReadinessResultDto,
      applicationCount: 0,
    });
    expect(done(steps)).toEqual([
      "profile",
      "discovery",
      "domain",
      "skill-gap",
      "learning-path",
      "assessment",
    ]);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["skill-gap"].status).toBe("58% covered");
    expect(byKey["learning-path"]).toMatchObject({ status: "38%, ongoing", progress: 38 });
    expect(byKey.assessment.status).toBe("Best 74%");
    // A readiness score below target is calculated but not yet "done".
    expect(byKey.readiness).toMatchObject({ done: false, status: "62, target 70" });
  });

  it("counts readiness as done once the target is reached, and opportunities once one is tracked", () => {
    const steps = buildJourney({
      readiness: { score: 70, target: 70 } as ReadinessResultDto,
      mockCompleted: true,
      applicationCount: 2,
    });
    expect(done(steps)).toEqual(["mock-eval", "readiness", "opportunities"]);
    expect(steps.at(-1)).toMatchObject({ href: "/applications", status: "Tracking 2" });
  });

  it("has a next-best-action for every step", () => {
    for (const s of buildJourney({ mockCompleted: false, applicationCount: 0 })) {
      expect(nextActionFor(s.key).title).toBeTruthy();
    }
  });
});

describe("relativeDays", () => {
  it("reads naturally", () => {
    expect(relativeDays(-2)).toBe("Overdue by 2 days");
    expect(relativeDays(-1)).toBe("Overdue by 1 day");
    expect(relativeDays(0)).toBe("Today");
    expect(relativeDays(1)).toBe("Tomorrow");
    expect(relativeDays(5)).toBe("In 5 days");
  });
});
