import { Schema, model } from "mongoose";

/**
 * A cached "why this fits you" explanation. Keyed by a hash of the profile text, so it is reused until the student's
 * profile changes, and expires after two weeks so stale explanations do not linger.
 */
const matchReasonSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
  profileHash: { type: String, required: true },
  reason: { type: String, required: true },
  caution: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, expires: 14 * 24 * 60 * 60 },
});
matchReasonSchema.index({ userId: 1, opportunityId: 1, profileHash: 1 }, { unique: true });

export const MatchReason = model("MatchReason", matchReasonSchema);
