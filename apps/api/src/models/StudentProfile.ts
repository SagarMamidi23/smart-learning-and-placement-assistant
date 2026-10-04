import { Schema, model } from "mongoose";
import type { Education, StudentProfileDto } from "@slp/shared";

const educationSchema = new Schema(
  {
    degree: { type: String, required: true },
    institution: { type: String, required: true },
    fieldOfStudy: String,
    startYear: Number,
    endYear: Number,
    score: String,
  },
  { _id: false },
);

const studentProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    education: { type: [educationSchema], default: [] },
    skills: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    resumeKey: { type: String, default: null },
    resumeUrl: { type: String, default: null },
    resumeText: { type: String, default: "" },
    activeDomain: { type: String, default: null },
    careerDiscoveryResult: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const StudentProfile = model("StudentProfile", studentProfileSchema);

export function toProfileDto(p: {
  userId: unknown;
  education: unknown;
  skills: string[];
  interests: string[];
  resumeUrl?: string | null;
  resumeText?: string | null;
  activeDomain?: string | null;
  careerDiscoveryResult?: unknown;
}): StudentProfileDto {
  const text = p.resumeText ?? "";
  return {
    userId: String(p.userId),
    education: p.education as Education[],
    skills: p.skills,
    interests: p.interests,
    resumeUrl: p.resumeUrl ?? null,
    hasResume: Boolean(p.resumeUrl),
    resumeTextLength: text.length,
    resumeTextPreview: text.slice(0, 500),
    activeDomain: p.activeDomain ?? null,
    careerDiscoveryResult: p.careerDiscoveryResult ?? null,
  };
}
