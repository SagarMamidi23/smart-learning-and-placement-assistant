import { priorityOf, scoreSkillGap } from "./skillGapScoring";

const benchmarks = [
  { name: "Algorithms", level: 4, weight: 0.4 },
  { name: "SQL", level: 3, weight: 0.3 },
  { name: "Git", level: 3, weight: 0.2 },
  { name: "Testing", level: 2, weight: 0.1 },
];

describe("priorityOf", () => {
  it("combines gap size with the skill's weight relative to the heaviest skill", () => {
    expect(priorityOf(4, 0.4, 0.4)).toBe("high"); // score 4
    expect(priorityOf(2, 0.3, 0.4)).toBe("medium"); // score 1.5
    expect(priorityOf(1, 0.1, 0.4)).toBe("low"); // score 0.25
    expect(priorityOf(2, 0.4, 0.4)).toBe("high"); // exactly 2
  });
});

describe("scoreSkillGap", () => {
  it("splits skills at their target level and computes weighted coverage", () => {
    const out = scoreSkillGap(benchmarks, [
      { skill: "Algorithms", currentLevel: 2, evidence: "ok" }, // half of target 4
      { skill: "SQL", currentLevel: 3, evidence: "uses SQL" }, // meets target
      { skill: "Git", currentLevel: 0, evidence: "" },
      { skill: "Testing", currentLevel: 5, evidence: "" }, // above target counts as full, not more
    ]);
    expect(out.strengths.map((s) => s.skill)).toEqual(["SQL", "Testing"]);
    expect(out.gaps.map((g) => g.skill)).toEqual(["Algorithms", "Git"]);
    // 0.4*0.5 + 0.3*1 + 0.2*0 + 0.1*1 = 0.6
    expect(out.coverage).toBe(60);
  });

  it("orders gaps by gap size times weight", () => {
    const out = scoreSkillGap(benchmarks, [
      { skill: "Algorithms", currentLevel: 3, evidence: "" }, // 1 * 0.4 = 0.4
      { skill: "SQL", currentLevel: 0, evidence: "" }, // 3 * 0.3 = 0.9
      { skill: "Git", currentLevel: 2, evidence: "" }, // 1 * 0.2 = 0.2
      { skill: "Testing", currentLevel: 2, evidence: "" },
    ]);
    expect(out.gaps.map((g) => g.skill)).toEqual(["SQL", "Algorithms", "Git"]);
  });

  it("reports 100 coverage and no gaps when everything is met", () => {
    const out = scoreSkillGap(
      benchmarks,
      benchmarks.map((b) => ({ skill: b.name, currentLevel: b.level, evidence: "" })),
    );
    expect(out.gaps).toEqual([]);
    expect(out.coverage).toBe(100);
  });

  it("treats a skill with no assessment as level 0", () => {
    const out = scoreSkillGap(benchmarks, []);
    expect(out.coverage).toBe(0);
    expect(out.gaps).toHaveLength(4);
  });
});
