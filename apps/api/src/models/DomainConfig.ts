import { Schema, model } from "mongoose";
import {
  ASSESSMENT_TYPES,
  MOCK_EVAL_TYPES,
  OPPORTUNITY_TYPES,
  SKILL_CATEGORIES,
  SKILL_SOURCES,
  type DomainConfigData,
  type DomainSummary,
} from "@slp/shared";

const skillSchema = new Schema(
  {
    name: { type: String, required: true },
    level: { type: Number, required: true, min: 1, max: 5 },
    weight: { type: Number, required: true, min: 0 },
    category: { type: String, enum: SKILL_CATEGORIES, default: "core" },
    source: { type: String, enum: SKILL_SOURCES, default: "curated" },
  },
  { _id: false },
);

const rubricSchema = new Schema(
  {
    criterion: { type: String, required: true },
    weight: { type: Number, required: true },
    description: String,
  },
  { _id: false },
);

const examSchema = new Schema(
  {
    name: { type: String, required: true },
    months: { type: [Number], default: [] },
    notes: String,
  },
  { _id: false },
);

const domainConfigSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    benchmarkSkills: { type: [skillSchema], default: [] },
    assessmentTypes: { type: [String], enum: ASSESSMENT_TYPES, default: [] },
    mockEvaluation: {
      type: { type: String, enum: MOCK_EVAL_TYPES, required: true },
      rubric: { type: [rubricSchema], default: [] },
    },
    readinessTarget: { type: Number, required: true, min: 0, max: 100 },
    opportunityTypes: { type: [String], enum: OPPORTUNITY_TYPES, default: [] },
    examCalendar: { type: [examSchema], default: [] },
    safetyNotice: String,
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const DomainConfig = model("DomainConfig", domainConfigSchema);

type DomainLike = DomainConfigData & { createdAt?: Date; updatedAt?: Date };

/** Full config as sent to clients (no Mongo internals). */
export function toDomainDetail(raw: unknown) {
  const doc = raw as DomainLike;
  return {
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    benchmarkSkills: doc.benchmarkSkills,
    assessmentTypes: doc.assessmentTypes,
    mockEvaluation: doc.mockEvaluation,
    readinessTarget: doc.readinessTarget,
    opportunityTypes: doc.opportunityTypes,
    examCalendar: doc.examCalendar,
    safetyNotice: doc.safetyNotice ?? undefined,
    isActive: doc.isActive,
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export const toSummary = (raw: unknown): DomainSummary => {
  const doc = raw as DomainLike;
  return {
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    readinessTarget: doc.readinessTarget,
    opportunityTypes: doc.opportunityTypes,
    safetyNotice: doc.safetyNotice ?? undefined,
    isActive: doc.isActive,
  };
};
