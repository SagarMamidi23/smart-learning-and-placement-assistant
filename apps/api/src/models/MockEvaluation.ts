import { Schema, model } from "mongoose";
import type { MockEvalDto } from "@slp/shared";

const mockEvaluationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    domain: { type: String, required: true },
    type: { type: String, enum: ["interview", "practical-task"], required: true },
    mode: { type: String, enum: ["text", "voice"], default: "text" },
    status: { type: String, enum: ["in-progress", "completed"], default: "in-progress" },
    questions: {
      type: [new Schema({ id: String, prompt: String, focus: String }, { _id: false })],
      default: [],
    },
    /** Snapshot of the domain's rubric at the time the evaluation started, so later edits do not change old results. */
    rubric: {
      type: [
        new Schema({ criterion: String, weight: Number, description: String }, { _id: false }),
      ],
      default: [],
    },
    answers: {
      type: [new Schema({ questionId: String, text: String }, { _id: false })],
      default: [],
    },
    rubricScores: {
      type: [
        new Schema(
          { criterion: String, weight: Number, score: Number, comment: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    questionFeedback: {
      type: [new Schema({ questionId: String, feedback: String }, { _id: false })],
      default: [],
    },
    /** Weighted rubric score, 0-100. */
    overallScore: Number,
    feedback: {
      summary: String,
      strengths: [String],
      improvements: [String],
    },
    completedAt: Date,
    llm: { type: String, default: "" },
  },
  { timestamps: true },
);
mockEvaluationSchema.index({ userId: 1, domain: 1, createdAt: -1 });

export const MockEvaluation = model("MockEvaluation", mockEvaluationSchema);

export function toMockEvalDto(raw: unknown): MockEvalDto {
  const m = JSON.parse(JSON.stringify(raw)) as MockEvalDto & { _id: string; createdAt: string };
  const completed = m.status === "completed";
  return {
    id: String(m._id),
    domain: m.domain,
    type: m.type,
    mode: m.mode,
    status: m.status,
    createdAt: m.createdAt,
    completedAt: m.completedAt,
    questions: m.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      focus: q.focus ?? undefined,
    })),
    rubric: m.rubric.map((r) => ({
      criterion: r.criterion,
      weight: r.weight,
      description: r.description ?? undefined,
    })),
    ...(completed
      ? {
          answers: m.answers,
          rubricScores: m.rubricScores,
          questionFeedback: m.questionFeedback,
          overallScore: m.overallScore,
          feedback: m.feedback,
        }
      : {}),
  };
}
