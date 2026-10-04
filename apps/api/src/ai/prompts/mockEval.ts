import { z } from "zod";
import { DATA_RULE, fence } from "./common";

interface RubricItem {
  criterion: string;
  weight: number;
  description?: string | null;
}

export function mockQuestionsSchema(count: number, rubric: RubricItem[]) {
  const canonical = new Map(rubric.map((r) => [r.criterion.toLowerCase(), r.criterion]));
  return z
    .object({
      questions: z
        .array(
          z.object({
            prompt: z.string().trim().min(15).max(900),
            focus: z.string().trim().max(120).optional(),
          }),
        )
        .length(count),
    })
    .transform((v) => ({
      questions: v.questions.map((q) => ({
        prompt: q.prompt,
        focus: q.focus ? canonical.get(q.focus.toLowerCase()) : undefined,
      })),
    }));
}

export function buildMockQuestionsPrompt(args: {
  domainName: string;
  type: "interview" | "practical-task";
  safetyNotice?: string;
  rubric: RubricItem[];
  gaps: string[];
  count: number;
}) {
  const interview = args.type === "interview";
  const system = [
    interview
      ? `You are an experienced interviewer preparing a mock interview for a ${args.domainName} candidate in India.`
      : `You design practical exercises for a ${args.domainName} candidate in India: realistic scenarios, calculations or case tasks answered in writing.`,
    `Write exactly ${args.count} ${interview ? "interview questions" : "practical tasks"}, ordered from easier to harder. Each must be answerable in a few paragraphs of text, with no diagrams or files.`,
    interview
      ? "Mix technical depth with situational and motivation questions where the rubric calls for it."
      : "Each task should state the situation, any numbers needed, and what the candidate must produce.",
    'Set "focus" to the single rubric criterion the question mainly tests, copied exactly from the list.',
    "Prefer the candidate's weaker skills when they are listed, but do not mention that you were told about them.",
    "Never invent real people, organisations, statistics or case citations.",
    DATA_RULE,
    args.safetyNotice
      ? `Important: ${args.safetyNotice} Prepare exam and career practice only; do not give professional advice.`
      : "",
    'Reply with ONLY a JSON object: {"questions": [{"prompt": string, "focus": string}]}',
    `The "questions" array must have exactly ${args.count} items.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "RUBRIC CRITERIA:",
    ...args.rubric.map((r) => `- ${r.criterion}${r.description ? `: ${r.description}` : ""}`),
    args.gaps.length ? `\nCandidate's weaker skills: ${args.gaps.join(", ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { system, prompt };
}

export function mockScoreSchema(rubric: RubricItem[], questionIds: string[]) {
  const canonical = new Map(rubric.map((r) => [r.criterion.toLowerCase(), r.criterion]));
  const ids = new Set(questionIds);
  return z
    .object({
      rubricScores: z.array(
        z.object({
          criterion: z.string().trim(),
          score: z.number().min(0).max(10),
          comment: z.string().trim().min(3).max(500),
        }),
      ),
      questionFeedback: z
        .array(z.object({ questionId: z.string(), feedback: z.string().trim().min(3).max(500) }))
        .default([]),
      summary: z.string().trim().min(20).max(800),
      strengths: z.array(z.string().trim().min(3).max(250)).min(1).max(4),
      improvements: z.array(z.string().trim().min(3).max(250)).min(1).max(4),
    })
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      const unknown: string[] = [];
      for (const r of v.rubricScores) {
        const key = r.criterion.toLowerCase();
        if (!canonical.has(key)) unknown.push(r.criterion);
        else seen.add(key);
      }
      const missing = [...canonical.entries()].filter(([k]) => !seen.has(k)).map(([, n]) => n);
      if (unknown.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rubricScores"],
          message: `unknown criteria (copy the names exactly): ${unknown.join(", ")}`,
        });
      }
      if (missing.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rubricScores"],
          message: `missing a score for: ${missing.join(", ")}`,
        });
      }
    })
    .transform((v) => ({
      ...v,
      // One score per criterion, canonical spelling, to one decimal place; unknown question ids are dropped.
      rubricScores: [
        ...new Map(
          v.rubricScores.map((r) => [
            r.criterion.toLowerCase(),
            {
              ...r,
              criterion: canonical.get(r.criterion.toLowerCase())!,
              score: Math.round(r.score * 10) / 10,
            },
          ]),
        ).values(),
      ],
      questionFeedback: v.questionFeedback.filter((f) => ids.has(f.questionId)),
    }));
}

export function buildMockScoringPrompt(args: {
  domainName: string;
  type: "interview" | "practical-task";
  safetyNotice?: string;
  rubric: RubricItem[];
  items: { id: string; prompt: string; answer: string }[];
}) {
  const system = [
    `You evaluate a candidate's written answers in a ${args.domainName} mock ${args.type === "interview" ? "interview" : "practical exercise"}, as a strict but fair examiner.`,
    "Score EVERY rubric criterion from 0 to 10 (0 = nothing relevant, 5 = adequate, 8 = strong, 10 = exceptional) based only on the answers. Missing, empty or off-topic answers must lower the relevant scores. Do not reward length or confident tone without substance.",
    "Give a short comment per criterion that cites what the candidate actually said. Then give per-question feedback, an overall summary (2-4 sentences, addressed to the candidate), 1-4 strengths and 1-4 concrete improvements.",
    DATA_RULE,
    args.safetyNotice
      ? `Important: ${args.safetyNotice} Evaluate exam-practice quality only; do not give professional advice.`
      : "",
    "Reply with ONLY a JSON object:",
    `{"rubricScores": [{"criterion": string (exact name), "score": number 0-10, "comment": string}], "questionFeedback": [{"questionId": string, "feedback": string}], "summary": string, "strengths": [string], "improvements": [string]}`,
    `Include exactly one score for each of the ${args.rubric.length} criteria.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "RUBRIC CRITERIA:",
    ...args.rubric.map((r) => `- ${r.criterion}${r.description ? `: ${r.description}` : ""}`),
    "",
    ...args.items.map(
      (i) =>
        `QUESTION ${i.id}: ${i.prompt}\n${fence("candidate_answer", i.answer.trim() || "(no answer given)")}`,
    ),
  ].join("\n\n");

  return { system, prompt };
}

/** Weighted rubric score on a 0-100 scale. Criteria weights sum to 1. */
export function overallScore(scores: { weight: number; score: number }[]): number {
  const total = scores.reduce((s, r) => s + r.weight, 0) || 1;
  return (
    Math.round((scores.reduce((s, r) => s + r.weight * (r.score / 10), 0) / total) * 1000) / 10
  );
}
