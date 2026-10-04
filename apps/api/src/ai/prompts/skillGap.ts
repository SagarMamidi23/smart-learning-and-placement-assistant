import { z } from "zod";
import type { Benchmark } from "../skillGapScoring";
import { DATA_RULE, fence, renderProfile, type ProfileEvidence } from "./common";

export function skillGapSchema(benchmarks: Benchmark[]) {
  const canonical = new Map(benchmarks.map((b) => [b.name.toLowerCase(), b.name]));
  return z
    .object({
      summary: z.string().trim().min(20).max(800),
      assessments: z
        .array(
          z.object({
            skill: z.string().trim(),
            currentLevel: z
              .number()
              .min(0)
              .max(5)
              .transform((n) => Math.round(n)),
            evidence: z.string().trim().max(300).default(""),
          }),
        )
        .min(1),
    })
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      const unknown: string[] = [];
      for (const a of v.assessments) {
        const key = a.skill.toLowerCase();
        if (!canonical.has(key)) unknown.push(a.skill);
        else seen.add(key);
      }
      const missing = [...canonical.entries()]
        .filter(([k]) => !seen.has(k))
        .map(([, name]) => name);
      if (unknown.length) {
        ctx.addIssue({
          code: "custom",
          path: ["assessments"],
          message: `unknown skills (use the benchmark names exactly): ${unknown.join(", ")}`,
        });
      }
      if (missing.length) {
        ctx.addIssue({
          code: "custom",
          path: ["assessments"],
          message: `missing a rating for: ${missing.join(", ")}`,
        });
      }
    })
    .transform((v) => ({
      summary: v.summary,
      // Restore the benchmark's own spelling, and keep one rating per skill.
      assessments: [
        ...new Map(
          v.assessments.map((a) => [
            a.skill.toLowerCase(),
            { ...a, skill: canonical.get(a.skill.toLowerCase())! },
          ]),
        ).values(),
      ],
    }));
}

export function buildSkillGapPrompt(args: {
  domainName: string;
  safetyNotice?: string;
  benchmarks: Benchmark[];
  profile: ProfileEvidence;
}) {
  const system = [
    `You assess how well a candidate's evidence matches the benchmark skills for a career domain (${args.domainName}).`,
    "Rate currentLevel for EVERY benchmark skill: 0 = no evidence, 1 = awareness, 2 = basic, 3 = working proficiency, 4 = advanced, 5 = expert.",
    "Base each rating ONLY on the evidence given. A skill that is not mentioned or clearly implied must be rated 0 or 1. Do not inflate ratings to be kind.",
    "For each skill, evidence is a short quote or paraphrase (max 120 characters) from the candidate's data, or 'No evidence'.",
    DATA_RULE,
    "Reply with ONLY a JSON object:",
    `{"summary": string (2-4 sentences addressing the candidate as "you": main strengths, biggest gaps, and where to start), "assessments": [{"skill": string (exact benchmark name), "currentLevel": integer 0-5, "evidence": string}]}`,
    `Include exactly one assessment per benchmark skill, ${args.benchmarks.length} in total.`,
    args.safetyNotice ? `Note: ${args.safetyNotice} Do not give professional advice.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "BENCHMARK SKILLS (name, target level 1-5):",
    ...args.benchmarks.map((b) => `- ${b.name} (target ${b.level})`),
    "",
    fence("student_data", renderProfile(args.profile)),
  ].join("\n");

  return { system, prompt };
}
