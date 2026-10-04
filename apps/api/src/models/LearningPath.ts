import { Schema, model } from "mongoose";
import { RESOURCE_TYPES, WEEK_STATUSES, type LearningPathDto } from "@slp/shared";

const weekSchema = new Schema(
  {
    week: { type: Number, required: true },
    title: { type: String, required: true },
    status: { type: String, enum: WEEK_STATUSES, default: "not-started" },
    goals: {
      type: [new Schema({ text: String, done: { type: Boolean, default: false } }, { _id: false })],
      default: [],
    },
    topics: { type: [String], default: [] },
    resources: {
      type: [
        new Schema(
          { title: String, type: { type: String, enum: RESOURCE_TYPES }, provider: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    focusSkills: { type: [String], default: [] },
  },
  { _id: false },
);

const learningPathSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    domain: { type: String, required: true },
    version: { type: Number, required: true },
    gapReportId: { type: Schema.Types.ObjectId, ref: "SkillGapReport", required: true },
    hoursPerWeek: { type: Number, required: true },
    stale: { type: Boolean, default: false },
    weeks: { type: [weekSchema], default: [] },
    llm: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);
learningPathSchema.index({ userId: 1, domain: 1, version: -1 }, { unique: true });

export const LearningPath = model("LearningPath", learningPathSchema);

type WeekStatus = (typeof WEEK_STATUSES)[number];

/** A week's status follows its goals: none done, some done, all done. */
export function weekStatus(goals: { done: boolean }[]): WeekStatus {
  const done = goals.filter((g) => g.done).length;
  if (done === 0) return "not-started";
  return done === goals.length ? "done" : "in-progress";
}

export function completionPct(weeks: { goals: { done: boolean }[] }[]): number {
  const all = weeks.flatMap((w) => w.goals);
  return all.length ? Math.round((all.filter((g) => g.done).length / all.length) * 100) : 0;
}

type PathLike = {
  _id: unknown;
  domain: string;
  version: number;
  createdAt: Date;
  hoursPerWeek: number;
  stale?: boolean | null;
  weeks: LearningPathDto["weeks"];
};

export function toLearningPathDto(raw: unknown): LearningPathDto {
  const p = raw as PathLike;
  return {
    id: String(p._id),
    domain: p.domain,
    version: p.version,
    generatedAt: p.createdAt.toISOString(),
    hoursPerWeek: p.hoursPerWeek,
    stale: Boolean(p.stale),
    completionPct: completionPct(p.weeks),
    weeks: p.weeks.map((w) => ({
      week: w.week,
      title: w.title,
      status: w.status,
      goals: w.goals.map((g) => ({ text: g.text, done: g.done })),
      topics: [...w.topics],
      resources: w.resources.map((r) => ({
        title: r.title,
        type: r.type,
        provider: r.provider ?? undefined,
      })),
      focusSkills: [...w.focusSkills],
    })),
  };
}
