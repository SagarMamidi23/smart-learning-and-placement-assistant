import { Schema, model } from "mongoose";

const assessmentAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    domain: { type: String, required: true },
    status: { type: String, enum: ["in-progress", "submitted"], default: "in-progress" },
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    timeTakenSec: Number,
    answers: {
      type: [new Schema({ questionId: String, selected: Number, text: String }, { _id: false })],
      default: [],
    },
    results: {
      type: [
        new Schema(
          {
            questionId: String,
            correct: Boolean,
            awarded: Number,
            max: Number,
            feedback: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Percentage, 0-100. */
    score: Number,
    llm: { type: String, default: "" },
  },
  { timestamps: true },
);

export const AssessmentAttempt = model("AssessmentAttempt", assessmentAttemptSchema);
