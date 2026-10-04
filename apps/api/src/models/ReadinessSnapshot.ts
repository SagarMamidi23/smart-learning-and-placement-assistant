import { Schema, model } from "mongoose";

const readinessSnapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    domain: { type: String, required: true },
    /** The exact inputs the score was computed from: kept so the model can be retrained on real data later. */
    features: {
      assessment_avg: { type: Number, required: true },
      mock_eval_avg: { type: Number, required: true },
      path_completion_pct: { type: Number, required: true },
      skill_gap_coverage_pct: { type: Number, required: true },
      mentor_engagement: { type: Number, required: true },
      days_active: { type: Number, required: true },
      recency_days: { type: Number, required: true },
    },
    score: { type: Number, required: true },
    modelVersion: { type: String, required: true },
    isFallback: { type: Boolean, default: false },
    factors: { type: [Schema.Types.Mixed], default: [] },
    target: { type: Number, required: true },
    decision: { type: String, enum: ["opportunities", "learning"], required: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
readinessSnapshotSchema.index({ userId: 1, domain: 1, createdAt: -1 });

export const ReadinessSnapshot = model("ReadinessSnapshot", readinessSnapshotSchema);
