import { Schema, model } from "mongoose";
import { GAP_PRIORITIES, type SkillGapDto } from "@slp/shared";

const strengthSchema = new Schema(
  {
    skill: { type: String, required: true },
    currentLevel: { type: Number, required: true },
    targetLevel: { type: Number, required: true },
    evidence: { type: String, default: "" },
  },
  { _id: false },
);

const gapSchema = new Schema(
  {
    skill: { type: String, required: true },
    currentLevel: { type: Number, required: true },
    targetLevel: { type: Number, required: true },
    priority: { type: String, enum: GAP_PRIORITIES, required: true },
  },
  { _id: false },
);

const skillGapReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    domain: { type: String, required: true },
    strengths: { type: [strengthSchema], default: [] },
    gaps: { type: [gapSchema], default: [] },
    coverage: { type: Number, required: true },
    summary: { type: String, required: true },
    usedResume: { type: Boolean, default: false },
    /** Which model produced the levels, for reproducibility in the project report. */
    llm: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
skillGapReportSchema.index({ userId: 1, domain: 1, createdAt: -1 });

export const SkillGapReport = model("SkillGapReport", skillGapReportSchema);

export function toSkillGapDto(r: {
  _id: unknown;
  domain: string;
  createdAt: Date;
  coverage: number;
  summary: string;
  usedResume?: boolean | null;
  strengths: SkillGapDto["strengths"];
  gaps: SkillGapDto["gaps"];
}): SkillGapDto {
  return {
    id: String(r._id),
    domain: r.domain,
    generatedAt: r.createdAt.toISOString(),
    coverage: r.coverage,
    summary: r.summary,
    usedResume: Boolean(r.usedResume),
    strengths: r.strengths.map((s) => ({
      skill: s.skill,
      currentLevel: s.currentLevel,
      targetLevel: s.targetLevel,
      evidence: s.evidence,
    })),
    gaps: r.gaps.map((g) => ({
      skill: g.skill,
      currentLevel: g.currentLevel,
      targetLevel: g.targetLevel,
      priority: g.priority,
    })),
  };
}
