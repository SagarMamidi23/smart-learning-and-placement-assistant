import { Schema, model } from "mongoose";
import { OPPORTUNITY_TYPES, type OpportunityDto } from "@slp/shared";

const opportunitySchema = new Schema(
  {
    /** Stable id for seeded rows, so re-seeding updates rather than duplicates. */
    seedId: { type: String, index: true, sparse: true, unique: true },
    domain: { type: String, required: true, index: true },
    type: { type: String, enum: OPPORTUNITY_TYPES, required: true },
    title: { type: String, required: true },
    organisation: { type: String, required: true },
    location: { type: String, default: "India" },
    eligibility: { type: String, default: "" },
    deadline: { type: Date, default: null },
    link: { type: String, required: true },
    description: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    source: { type: String, enum: ["seed", "admin"], default: "admin" },
    /** Vector of title + organisation + description + eligibility, for matching. Empty until embedded. */
    embedding: { type: [Number], default: [], select: false },
    embeddingModel: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const Opportunity = model("Opportunity", opportunitySchema);

const DAY_MS = 86_400_000;

/** Whole days from today (UTC) until the deadline: negative once passed, null when there is no deadline. */
export function daysLeft(deadline: Date | null | undefined, now = new Date()): number | null {
  if (!deadline) return null;
  return Math.floor(deadline.getTime() / DAY_MS) - Math.floor(now.getTime() / DAY_MS);
}

/** The text that is embedded for matching. */
export const embeddingText = (o: {
  title: string;
  organisation: string;
  description: string;
  eligibility?: string | null;
}) =>
  [o.title, o.organisation, o.description, o.eligibility].filter(Boolean).join(". ").slice(0, 3500);

export function toOpportunityDto(raw: unknown, now = new Date()): OpportunityDto {
  const o = raw as {
    _id: unknown;
    domain: string;
    type: OpportunityDto["type"];
    title: string;
    organisation: string;
    location?: string;
    eligibility?: string;
    deadline?: Date | null;
    link: string;
    description: string;
    isActive?: boolean;
  };
  return {
    id: String(o._id),
    domain: o.domain,
    type: o.type,
    title: o.title,
    organisation: o.organisation,
    location: o.location ?? "India",
    eligibility: o.eligibility ?? "",
    deadline: o.deadline ? o.deadline.toISOString().slice(0, 10) : null,
    link: o.link,
    description: o.description,
    isActive: o.isActive ?? true,
    daysLeft: daysLeft(o.deadline, now),
  };
}
