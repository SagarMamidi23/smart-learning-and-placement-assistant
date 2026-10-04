import { Schema, model } from "mongoose";
import { APPLICATION_STATUSES, type ApplicationDto } from "@slp/shared";
import { toOpportunityDto } from "./Opportunity";

const applicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: "saved" },
    notes: { type: String, default: "" },
    /** The student's own reminders, for example "Admit card released" or "Document verification". */
    deadlines: {
      type: [new Schema({ label: String, date: Date }, { _id: false })],
      default: [],
    },
    appliedAt: Date,
    history: {
      type: [
        new Schema(
          {
            status: { type: String, enum: APPLICATION_STATUSES },
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);
applicationSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });

export const Application = model("Application", applicationSchema);

export function toApplicationDto(raw: unknown, opportunity: unknown | null): ApplicationDto {
  const a = raw as {
    _id: unknown;
    status: ApplicationDto["status"];
    notes?: string;
    deadlines: { label: string; date: Date }[];
    appliedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    history: { status: ApplicationDto["status"]; at: Date }[];
  };
  return {
    id: String(a._id),
    status: a.status,
    notes: a.notes ?? "",
    deadlines: a.deadlines.map((d) => ({
      label: d.label,
      date: d.date.toISOString().slice(0, 10),
    })),
    appliedAt: a.appliedAt?.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    history: a.history.map((h) => ({ status: h.status, at: h.at.toISOString() })),
    opportunity: opportunity ? toOpportunityDto(opportunity) : null,
  };
}
