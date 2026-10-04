import { z } from "zod";
import { mcqQuestionSchema, practicalQuestionSchema, type Question } from "@slp/shared";
import type { Hit } from "../rag/retrieve";
import { DATA_RULE, fence } from "./common";

const rawMcq = mcqQuestionSchema.omit({ id: true });
const rawPractical = practicalQuestionSchema.omit({ id: true });
const rawQuestion = z.discriminatedUnion("kind", [rawMcq, rawPractical]);

/** Question counts and option sanity are checked here so a failure triggers the model's corrective retry. */
export function assessmentGenSchema(count: number, practicalCount: number, skills: string[]) {
  const canonical = new Map(skills.map((s) => [s.toLowerCase(), s]));
  return z
    .object({
      title: z.string().trim().min(3).max(150),
      questions: z.array(rawQuestion).length(count),
    })
    .superRefine((v, ctx) => {
      const practical = v.questions.filter((q) => q.kind === "practical").length;
      if (practical !== practicalCount) {
        ctx.addIssue({
          code: "custom",
          path: ["questions"],
          message: `expected exactly ${practicalCount} practical question(s) and ${count - practicalCount} mcq, got ${practical} practical`,
        });
      }
      const prompts = new Set<string>();
      v.questions.forEach((q, i) => {
        const key = q.prompt.toLowerCase();
        if (prompts.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", i, "prompt"],
            message: "duplicate question",
          });
        }
        prompts.add(key);
        if (q.kind === "mcq") {
          if (new Set(q.options.map((o) => o.toLowerCase())).size !== 4) {
            ctx.addIssue({
              code: "custom",
              path: ["questions", i, "options"],
              message: "the 4 options must all be different",
            });
          }
          if (q.options.some((o) => /^(all|none) of the above$/i.test(o.trim()))) {
            ctx.addIssue({
              code: "custom",
              path: ["questions", i, "options"],
              message: 'do not use "all of the above" or "none of the above"',
            });
          }
        }
      });
    })
    .transform((v) => ({
      title: v.title,
      questions: v.questions.map((q) => ({
        ...q,
        // Unknown skill tags are dropped rather than failing the whole draft.
        skill: q.skill ? canonical.get(q.skill.toLowerCase()) : undefined,
      })),
    }));
}

export type RawQuestion = z.output<ReturnType<typeof assessmentGenSchema>>["questions"][number];

/** MCQ options in a random order, with correctIndex remapped. Models favour putting the answer first. */
export function shuffleOptions<T extends { options: string[]; correctIndex: number }>(
  q: T,
  rand: () => number = Math.random,
): T {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

export function buildAssessmentPrompt(args: {
  domainName: string;
  safetyNotice?: string;
  skills: { name: string; level: number }[];
  count: number;
  practicalCount: number;
  difficulty?: number;
  focus?: string;
  passages: Hit[];
}) {
  const grounded = args.passages.length > 0;
  const difficulty =
    { 1: "easy", 2: "moderate", 3: "hard" }[args.difficulty ?? 0] ?? "mixed (mostly moderate)";
  const mcq = args.count - args.practicalCount;
  const system = [
    `You write exam-preparation questions for ${args.domainName} in the Indian context. Questions are reviewed by a human before students see them.`,
    `Write exactly ${mcq} multiple-choice question(s) and exactly ${args.practicalCount} practical question(s). Difficulty: ${difficulty}.`,
    'MCQ rules: exactly 4 distinct, plausible options; exactly one is correct; "correctIndex" is the 0-based index of the correct option; vary where the correct option sits; never use "all of the above" or "none of the above"; add a 1-2 sentence "explanation" of why the answer is right. Test understanding, not trivia.',
    'Each MCQ must have exactly ONE defensible correct answer. Do not write "which is the primary/best/main ..." questions where several options could reasonably be accepted by an examiner, and make the three wrong options clearly wrong to a knowledgeable person. If you are not certain a fact is settled and uncontested, ask a different question.',
    'Practical rules: a scenario, calculation, case or short-answer task a student can answer in writing; "modelAnswer" lists the key points or steps a strong answer must contain; "maxMarks" is an integer from 3 to 8.',
    "Every question must be self-contained and answerable without diagrams or images.",
    grounded
      ? "Base every question ONLY on the passages in <study_material>. Do not add facts that are not in them."
      : "Base the questions on the listed skills and the standard syllabus for this domain. Only ask about facts you are certain are correct.",
    'Set "skill" to exactly one of the listed skill names. Never invent statistics, dates or case citations.',
    DATA_RULE,
    args.safetyNotice
      ? `Important: ${args.safetyNotice} Write exam questions only; do not give professional advice.`
      : "",
    "Reply with ONLY a JSON object:",
    `{"title": string, "questions": [ {"kind": "mcq", "prompt": string, "options": [string, string, string, string], "correctIndex": integer, "explanation": string, "skill": string, "difficulty": integer 1-3} | {"kind": "practical", "prompt": string, "modelAnswer": string, "maxMarks": integer, "skill": string, "difficulty": integer 1-3} ]}`,
    `The "questions" array must have exactly ${args.count} items.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    `Skills for ${args.domainName} (name, target level 1-5):`,
    ...args.skills.map((s) => `- ${s.name} (${s.level})`),
    args.focus ? `\nFocus area requested by the reviewer: ${args.focus}` : "",
    grounded
      ? `\n${fence(
          "study_material",
          args.passages
            .map((p, i) => `[${i + 1}] ${p.title}, page ${p.page}\n${p.text}`)
            .join("\n\n"),
        )}`
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { system, prompt };
}

// ---- grading practical answers ----

export function practicalGradeSchema(items: { id: string; max: number }[]) {
  const max = new Map(items.map((i) => [i.id, i.max]));
  return z
    .object({
      results: z.array(
        z.object({
          questionId: z.string(),
          awarded: z.number().min(0),
          feedback: z.string().trim().min(3).max(600),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      for (const r of v.results) {
        if (!max.has(r.questionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["results"],
            message: `unknown questionId ${r.questionId}`,
          });
        } else if (r.awarded > max.get(r.questionId)!) {
          ctx.addIssue({
            code: "custom",
            path: ["results"],
            message: `awarded ${r.awarded} exceeds the maximum ${max.get(r.questionId)} for ${r.questionId}`,
          });
        }
        seen.add(r.questionId);
      }
      const missing = [...max.keys()].filter((id) => !seen.has(id));
      if (missing.length) {
        ctx.addIssue({
          code: "custom",
          path: ["results"],
          message: `missing grades for: ${missing.join(", ")}`,
        });
      }
    })
    .transform((v) => ({
      // Half marks at most, so scores stay readable.
      results: v.results.map((r) => ({ ...r, awarded: Math.round(r.awarded * 2) / 2 })),
    }));
}

export function buildPracticalGradingPrompt(args: {
  domainName: string;
  safetyNotice?: string;
  items: { id: string; prompt: string; modelAnswer: string; max: number; answer: string }[];
}) {
  const system = [
    `You grade written answers to ${args.domainName} exam-preparation questions fairly and strictly.`,
    "For each question compare the student's answer with the reference key points. Award marks (steps of 0.5, from 0 to the maximum) for key points that are present and correct; give no credit for vague, irrelevant or incorrect content; do not reward length.",
    "Give 1-2 sentences of feedback addressed to the student: what was good and what was missing.",
    DATA_RULE,
    args.safetyNotice ? `Note: ${args.safetyNotice}` : "",
    'Reply with ONLY a JSON object: {"results": [{"questionId": string, "awarded": number, "feedback": string}]} with exactly one entry per question.',
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = args.items
    .map(
      (i) =>
        `QUESTION ${i.id} (max ${i.max} marks)\n${i.prompt}\n\nREFERENCE KEY POINTS:\n${i.modelAnswer}\n\n${fence("student_answer", i.answer)}`,
    )
    .join("\n\n---\n\n");

  return { system, prompt };
}

export type { Question };
