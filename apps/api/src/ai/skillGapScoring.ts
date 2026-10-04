import type { GapPriority, SkillGapDto } from "@slp/shared";

export interface Benchmark {
  name: string;
  level: number;
  weight: number;
}

export interface Assessment {
  skill: string;
  currentLevel: number;
  evidence: string;
}

/** Gap priority from how far below target a skill is and how much the domain weights it. */
export function priorityOf(gapSize: number, weight: number, maxWeight: number): GapPriority {
  const score = gapSize * (weight / maxWeight);
  if (score >= 2) return "high";
  return score >= 1 ? "medium" : "low";
}

/**
 * Turns the model's evidence-based levels into the report. The arithmetic (what counts as a gap, how urgent it
 * is, how much of the benchmark is covered) is done here rather than by the model, so it is deterministic.
 */
export function scoreSkillGap(benchmarks: Benchmark[], assessments: Assessment[]) {
  const byName = new Map(assessments.map((a) => [a.skill.toLowerCase(), a]));
  const maxWeight = Math.max(...benchmarks.map((b) => b.weight));
  const strengths: SkillGapDto["strengths"] = [];
  const gaps: (SkillGapDto["gaps"][number] & { score: number })[] = [];
  let covered = 0;
  let totalWeight = 0;

  for (const b of benchmarks) {
    const a = byName.get(b.name.toLowerCase());
    const current = a?.currentLevel ?? 0;
    totalWeight += b.weight;
    covered += b.weight * Math.min(current / b.level, 1);
    if (current >= b.level) {
      strengths.push({
        skill: b.name,
        currentLevel: current,
        targetLevel: b.level,
        evidence: a?.evidence ?? "",
      });
    } else {
      const gap = b.level - current;
      gaps.push({
        skill: b.name,
        currentLevel: current,
        targetLevel: b.level,
        priority: priorityOf(gap, b.weight, maxWeight),
        score: gap * b.weight,
      });
    }
  }

  gaps.sort((x, y) => y.score - x.score);
  return {
    strengths,
    gaps: gaps.map(({ score: _score, ...g }) => g),
    coverage: Math.round((covered / totalWeight) * 1000) / 10,
  };
}
