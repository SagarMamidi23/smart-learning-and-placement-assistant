import { z } from "zod";
import { RESOURCE_TYPES, type SkillGapDto } from "@slp/shared";
import { DATA_RULE } from "./common";

const NO_LINKS = /https?:\/\/|www\./i;

export function learningPathSchema(weeks: number, gapSkills: string[]) {
  const canonical = new Map(gapSkills.map((s) => [s.toLowerCase(), s]));
  return z
    .object({
      weeks: z
        .array(
          z.object({
            title: z.string().trim().min(3).max(120),
            goals: z.array(z.string().trim().min(5).max(250)).min(2).max(5),
            topics: z.array(z.string().trim().min(2).max(120)).min(2).max(6),
            resources: z
              .array(
                z.object({
                  title: z
                    .string()
                    .trim()
                    .min(3)
                    .max(200)
                    .refine((t) => !NO_LINKS.test(t), "resource titles must not contain URLs"),
                  type: z.enum(RESOURCE_TYPES),
                  provider: z.string().trim().max(80).optional(),
                }),
              )
              .min(1)
              .max(4),
            focusSkills: z.array(z.string()).max(6).default([]),
          }),
        )
        .length(weeks),
    })
    .transform((v) => ({
      // Number weeks by position (the model sometimes mislabels them) and drop skills that aren't real gaps.
      weeks: v.weeks.map((w, i) => ({
        ...w,
        week: i + 1,
        focusSkills: w.focusSkills
          .map((s) => canonical.get(s.trim().toLowerCase()))
          .filter((s): s is string => Boolean(s)),
      })),
    }));
}

export function buildLearningPathPrompt(args: {
  domainName: string;
  safetyNotice?: string;
  gaps: SkillGapDto["gaps"];
  exams: string[];
  weeks: number;
  hoursPerWeek: number;
}) {
  const system = [
    `You are a study planner for students preparing for careers and exams in India (domain: ${args.domainName}).`,
    `Create a week-by-week plan of exactly ${args.weeks} weeks for about ${args.hoursPerWeek} study hours per week, to close the listed skill gaps.`,
    "Put high-priority gaps early and build foundations before advanced topics. Use the last week or two for revision and practice tests where that makes sense.",
    "Each week needs: a short title; 2-5 specific, measurable goals (things the student can tick off); 2-6 topics; 1-4 resources; and focusSkills copied exactly from the gap list.",
    "Resources: PREFER generic descriptions over specific titles, for example 'A standard undergraduate textbook on contract law', 'Official syllabus and previous-year question papers for the exam', 'Introductory video lectures on thermodynamics', 'Hands-on practice problems on arrays and sorting'. Name a specific book, course or author ONLY if you are certain it exists and certain of its exact author or provider. NEVER guess or invent authors, editions, publishers or course providers, and never attribute a title to an organisation unless that organisation really publishes it. NEVER include URLs or links.",
    `Resource type must be one of: ${RESOURCE_TYPES.join(", ")}.`,
    DATA_RULE,
    args.safetyNotice
      ? `Important: ${args.safetyNotice} Plan study and exam preparation only; do not give professional advice.`
      : "",
    "Reply with ONLY a JSON object:",
    `{"weeks": [{"title": string, "goals": [string], "topics": [string], "resources": [{"title": string, "type": string, "provider": string (optional)}], "focusSkills": [string]}]}`,
    `The "weeks" array must have exactly ${args.weeks} items in order.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "SKILL GAPS (skill: current level -> target level, priority):",
    ...args.gaps.map((g) => `- ${g.skill}: ${g.currentLevel} -> ${g.targetLevel}, ${g.priority}`),
    args.exams.length
      ? `\nRelevant exams in this domain (for context only): ${args.exams.join("; ")}`
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { system, prompt };
}
