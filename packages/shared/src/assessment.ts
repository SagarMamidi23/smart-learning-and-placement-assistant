import { z } from "zod";
import { ASSESSMENT_TYPES, slugSchema } from "./domain";

// ---- Assessments ----

export const QUESTION_KINDS = ["mcq", "practical"] as const;
export const ASSESSMENT_STATUSES = ["draft", "published"] as const;

const baseQuestion = {
  id: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(10).max(1200),
  explanation: z.string().trim().max(1000).default(""),
  /** The benchmark skill this question tests, when known. */
  skill: z.string().trim().max(100).optional(),
  difficulty: z.number().int().min(1).max(3).default(2),
};

export const mcqQuestionSchema = z.object({
  ...baseQuestion,
  kind: z.literal("mcq"),
  options: z.array(z.string().trim().min(1).max(400)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  maxMarks: z.literal(1).default(1),
});

export const practicalQuestionSchema = z.object({
  ...baseQuestion,
  kind: z.literal("practical"),
  /** Reference answer or key points. Used to grade, never shown to students before they submit. */
  modelAnswer: z.string().trim().min(20).max(2500),
  maxMarks: z.number().int().min(1).max(10).default(5),
});

export const questionSchema = z.discriminatedUnion("kind", [
  mcqQuestionSchema,
  practicalQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;

function checkQuestions(questions: Question[], ctx: z.RefinementCtx) {
  const ids = new Set<string>();
  questions.forEach((q, i) => {
    if (ids.has(q.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["questions", i, "id"],
        message: "Duplicate question id",
      });
    }
    ids.add(q.id);
    if (q.kind === "mcq") {
      const unique = new Set(q.options.map((o) => o.toLowerCase()));
      if (unique.size !== q.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "options"],
          message: "Options must all be different",
        });
      }
    }
  });
}

export const assessmentContentSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    type: z.enum(ASSESSMENT_TYPES),
    timeLimitMinutes: z.number().int().min(1).max(240).default(30),
    questions: z.array(questionSchema).min(1).max(40),
  })
  .superRefine((a, ctx) => checkQuestions(a.questions, ctx));
export type AssessmentContent = z.infer<typeof assessmentContentSchema>;

export const MIN_QUESTIONS_TO_PUBLISH = 3;

export const generateAssessmentSchema = z
  .object({
    domain: slugSchema,
    /** Defaults to mcq, or the first non-mcq type of the domain when practical questions are requested. */
    type: z.enum(ASSESSMENT_TYPES).optional(),
    /** Total questions, including practical ones. */
    count: z.number().int().min(3).max(15).default(8),
    practicalCount: z.number().int().min(0).max(5).default(0),
    difficulty: z.number().int().min(1).max(3).optional(),
    focus: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((g) => g.practicalCount < g.count, {
    path: ["practicalCount"],
    message: "Must be fewer than the total number of questions",
  });
export type GenerateAssessmentInput = z.input<typeof generateAssessmentSchema>;

export const submitAttemptSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.string().min(1).max(64),
            selected: z.number().int().min(0).max(3).optional(),
            text: z.string().max(4000).optional(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

/** What a student sees: no correct answers, explanations or reference answers. */
export type StudentQuestion =
  | { id: string; kind: "mcq"; prompt: string; options: string[]; skill?: string; maxMarks: number }
  | { id: string; kind: "practical"; prompt: string; skill?: string; maxMarks: number };

export interface AssessmentSummaryDto {
  id: string;
  domain: string;
  title: string;
  type: string;
  status: (typeof ASSESSMENT_STATUSES)[number];
  questionCount: number;
  timeLimitMinutes: number;
  grounded: boolean;
  publishedAt?: string;
  /** The student's best score so far, when they have attempted it. */
  bestScore?: number;
  attempts?: number;
}

export interface QuestionResultDto {
  questionId: string;
  kind: "mcq" | "practical";
  prompt: string;
  options?: string[];
  selected?: number;
  correctIndex?: number;
  answerText?: string;
  correct?: boolean;
  awarded: number;
  max: number;
  explanation: string;
  /** Practical questions: the reference answer, and the grader's feedback. */
  modelAnswer?: string;
  feedback?: string;
}

export interface AttemptDto {
  id: string;
  assessmentId: string;
  status: "in-progress" | "submitted";
  startedAt: string;
  submittedAt?: string;
  timeTakenSec?: number;
  timeLimitMinutes: number;
  score?: number;
  questions: StudentQuestion[];
  results?: QuestionResultDto[];
}

// ---- Mock evaluation ----

export const startMockEvalSchema = z
  .object({
    questionCount: z.number().int().min(3).max(6).default(4),
    mode: z.enum(["text", "voice"]).default("text"),
  })
  .partial()
  .strict();
export type StartMockEvalInput = z.infer<typeof startMockEvalSchema>;

export const submitMockEvalSchema = z
  .object({
    answers: z
      .array(
        z.object({ questionId: z.string().min(1).max(64), text: z.string().max(4000) }).strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type SubmitMockEvalInput = z.infer<typeof submitMockEvalSchema>;

export interface MockEvalDto {
  id: string;
  domain: string;
  type: "interview" | "practical-task";
  mode: "text" | "voice";
  status: "in-progress" | "completed";
  createdAt: string;
  completedAt?: string;
  questions: { id: string; prompt: string; focus?: string }[];
  rubric: { criterion: string; weight: number; description?: string }[];
  answers?: { questionId: string; text: string }[];
  rubricScores?: { criterion: string; weight: number; score: number; comment: string }[];
  questionFeedback?: { questionId: string; feedback: string }[];
  overallScore?: number;
  feedback?: { summary: string; strengths: string[]; improvements: string[] };
}

export interface FeaturesDto {
  /** Voice interviews (VAPI). Off unless the server enables it. */
  voice: boolean;
}
