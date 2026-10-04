import { randomUUID } from "node:crypto";
import {
  ASSESSMENT_TYPES,
  type AssessmentContent,
  type GenerateAssessmentInput,
  type Question,
  type QuestionResultDto,
} from "@slp/shared";
import { config } from "../config";
import { AppError } from "../errors";
import { Assessment } from "../models/Assessment";
import { getEmbedder } from "./embeddings";
import { getLLM } from "./llm";
import {
  assessmentGenSchema,
  buildAssessmentPrompt,
  buildPracticalGradingPrompt,
  practicalGradeSchema,
  shuffleOptions,
} from "./prompts/assessment";
import { retrieve, type Hit } from "./rag/retrieve";

type DomainDoc = {
  slug: string;
  name: string;
  safetyNotice?: string | null;
  assessmentTypes: string[];
  benchmarkSkills: { name: string; level: number; weight: number }[];
};

const MAX_PASSAGES = 8;
/** Question writing may use looser matches than answering a student does: a draft is reviewed by a human anyway. */
const GROUNDING_SLACK = 0.15;

/**
 * Study-material passages to base questions on: the top few for each of the heaviest skills (or the reviewer's
 * focus). Returns [] when the domain has no material or the embedding service is down, in which case questions
 * are written from the skill list alone and the draft is marked ungrounded.
 */
export async function groundingPassages(domain: DomainDoc, focus?: string): Promise<Hit[]> {
  const queries = focus
    ? [focus]
    : [...domain.benchmarkSkills]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 6)
        .map((s) => s.name);
  const seen = new Set<string>();
  const out: Hit[] = [];
  try {
    getEmbedder(); // fail fast if no embedder is configured
    for (const q of queries) {
      for (const hit of await retrieve(domain.slug, q, {
        k: 2,
        minScore: Math.max(0, config.ragMinScore - GROUNDING_SLACK),
      })) {
        if (!seen.has(hit.text)) {
          seen.add(hit.text);
          out.push(hit);
        }
      }
    }
  } catch {
    return [];
  }
  return out.slice(0, MAX_PASSAGES);
}

/** The assessment type to use: the reviewer's choice if the domain supports it, else a sensible default. */
export function pickType(
  domain: DomainDoc,
  input: GenerateAssessmentInput,
): AssessmentContent["type"] {
  const supported = domain.assessmentTypes.filter((t): t is AssessmentContent["type"] =>
    (ASSESSMENT_TYPES as readonly string[]).includes(t),
  );
  if (input.type) {
    if (!supported.includes(input.type)) {
      throw new AppError(
        400,
        "TYPE_NOT_SUPPORTED",
        `${domain.name} does not use "${input.type}" assessments`,
      );
    }
    return input.type;
  }
  if ((input.practicalCount ?? 0) > 0) return supported.find((t) => t !== "mcq") ?? "practical";
  return supported.includes("mcq") ? "mcq" : supported[0];
}

export async function generateDraft(args: {
  domain: DomainDoc;
  input: Required<Pick<GenerateAssessmentInput, "count" | "practicalCount">> &
    GenerateAssessmentInput;
  userId: string;
  rand?: () => number;
}) {
  const { domain, input } = args;
  const type = pickType(domain, input);
  const passages = await groundingPassages(domain, input.focus);
  const skills = domain.benchmarkSkills.map((s) => ({ name: s.name, level: s.level }));
  const { system, prompt } = buildAssessmentPrompt({
    domainName: domain.name,
    safetyNotice: domain.safetyNotice ?? undefined,
    skills,
    count: input.count,
    practicalCount: input.practicalCount,
    difficulty: input.difficulty,
    focus: input.focus,
    passages,
  });
  const llm = getLLM();
  const out = await llm.generateJson({
    feature: "assessment_generation",
    system,
    prompt,
    schema: assessmentGenSchema(
      input.count,
      input.practicalCount,
      skills.map((s) => s.name),
    ),
    temperature: 0.5,
  });

  const questions = out.questions.map((q): Question => {
    const id = randomUUID();
    if (q.kind === "mcq") return { ...shuffleOptions(q, args.rand), id };
    return { ...q, id };
  });
  return Assessment.create({
    domain: domain.slug,
    title: out.title,
    type,
    status: "draft",
    questions,
    timeLimitMinutes: Math.max(5, Math.min(120, questions.length * 2)),
    grounded: passages.length > 0,
    groundedOn: [...new Set(passages.map((p) => p.title))],
    origin: "llm",
    llm: `${llm.info.provider}/${llm.info.model}`,
    createdBy: args.userId,
  });
}

// ---- grading ----

export interface Answer {
  questionId: string;
  selected?: number;
  text?: string;
}

export interface PracticalGrade {
  questionId: string;
  awarded: number;
  feedback: string;
}

/** Percentage 0-100 to one decimal. */
export const percent = (awarded: number, max: number) =>
  max > 0 ? Math.round((awarded / max) * 1000) / 10 : 0;

/**
 * Pure grading: MCQs are marked against the key, practical questions take the grader's marks (blank answers get
 * zero). Returns per-question results with the correct answers revealed, plus the overall percentage.
 */
export function gradeAttempt(questions: Question[], answers: Answer[], grades: PracticalGrade[]) {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const gradeById = new Map(grades.map((g) => [g.questionId, g]));
  const results: QuestionResultDto[] = questions.map((q) => {
    const a = byId.get(q.id);
    if (q.kind === "mcq") {
      const answered = a?.selected !== undefined;
      const correct = answered && a!.selected === q.correctIndex;
      return {
        questionId: q.id,
        kind: "mcq",
        prompt: q.prompt,
        options: q.options,
        selected: a?.selected,
        correctIndex: q.correctIndex,
        correct,
        awarded: correct ? 1 : 0,
        max: 1,
        explanation: q.explanation,
      };
    }
    const g = gradeById.get(q.id);
    const blank = !a?.text?.trim();
    return {
      questionId: q.id,
      kind: "practical",
      prompt: q.prompt,
      answerText: a?.text ?? "",
      awarded: blank ? 0 : Math.min(g?.awarded ?? 0, q.maxMarks),
      max: q.maxMarks,
      explanation: q.explanation,
      modelAnswer: q.modelAnswer,
      feedback: blank ? "No answer given." : g?.feedback,
    };
  });
  const awarded = results.reduce((s, r) => s + r.awarded, 0);
  const max = results.reduce((s, r) => s + r.max, 0);
  return { results, score: percent(awarded, max) };
}

/** Asks the LLM to grade every non-blank practical answer in one call. Blank answers never reach the model. */
export async function gradePractical(
  domain: { name: string; safetyNotice?: string | null },
  questions: Question[],
  answers: Answer[],
): Promise<PracticalGrade[]> {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const items = questions.flatMap((q) => {
    const text = byId.get(q.id)?.text?.trim();
    return q.kind === "practical" && text
      ? [{ id: q.id, prompt: q.prompt, modelAnswer: q.modelAnswer, max: q.maxMarks, answer: text }]
      : [];
  });
  if (items.length === 0) return [];
  const { system, prompt } = buildPracticalGradingPrompt({
    domainName: domain.name,
    safetyNotice: domain.safetyNotice ?? undefined,
    items,
  });
  const out = await getLLM().generateJson({
    feature: "practical_grading",
    system,
    prompt,
    schema: practicalGradeSchema(items.map((i) => ({ id: i.id, max: i.max }))),
    temperature: 0.1,
  });
  return out.results;
}
