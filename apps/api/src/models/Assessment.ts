import { Schema, model } from "mongoose";
import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_TYPES,
  QUESTION_KINDS,
  type AssessmentSummaryDto,
  type Question,
  type StudentQuestion,
} from "@slp/shared";

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: QUESTION_KINDS, required: true },
    prompt: { type: String, required: true },
    options: { type: [String], default: undefined },
    correctIndex: Number,
    modelAnswer: String,
    explanation: { type: String, default: "" },
    skill: String,
    difficulty: { type: Number, default: 2 },
    maxMarks: { type: Number, default: 1 },
  },
  { _id: false },
);

const assessmentSchema = new Schema(
  {
    domain: { type: String, required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ASSESSMENT_TYPES, required: true },
    status: { type: String, enum: ASSESSMENT_STATUSES, default: "draft", index: true },
    questions: { type: [questionSchema], default: [] },
    timeLimitMinutes: { type: Number, default: 30 },
    /** True when the questions were written from uploaded study material rather than the skill list alone. */
    grounded: { type: Boolean, default: false },
    groundedOn: { type: [String], default: [] },
    origin: { type: String, enum: ["llm", "manual"], default: "llm" },
    llm: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: Date,
  },
  { timestamps: true },
);

export const Assessment = model("Assessment", assessmentSchema);

/** Plain question objects, without Mongoose internals. */
export const plainQuestions = (a: { questions: unknown }): Question[] =>
  JSON.parse(JSON.stringify(a.questions));

export function toStudentQuestion(q: Question): StudentQuestion {
  return q.kind === "mcq"
    ? { id: q.id, kind: "mcq", prompt: q.prompt, options: q.options, skill: q.skill, maxMarks: 1 }
    : { id: q.id, kind: "practical", prompt: q.prompt, skill: q.skill, maxMarks: q.maxMarks };
}

export function toSummaryDto(raw: unknown): AssessmentSummaryDto {
  const a = raw as {
    _id: unknown;
    domain: string;
    title: string;
    type: string;
    status: "draft" | "published";
    questions: unknown[];
    timeLimitMinutes: number;
    grounded?: boolean;
    publishedAt?: Date | null;
  };
  return {
    id: String(a._id),
    domain: a.domain,
    title: a.title,
    type: a.type,
    status: a.status,
    questionCount: a.questions.length,
    timeLimitMinutes: a.timeLimitMinutes,
    grounded: Boolean(a.grounded),
    publishedAt: a.publishedAt?.toISOString(),
  };
}
