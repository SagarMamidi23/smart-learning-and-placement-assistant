import { Router } from "express";
import type { ReadinessHistoryPoint } from "@slp/shared";
import { loadStudentContext } from "../ai/context";
import { AppError, asyncHandler } from "../errors";
import { authenticate } from "../middleware/auth";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { StudentProfile } from "../models/StudentProfile";
import { computeReadiness, describeSnapshot } from "../readiness/service";

export const readinessRouter = Router();
readinessRouter.use(authenticate);

readinessRouter.post(
  "/compute",
  asyncHandler(async (req, res) => {
    const { domain } = await loadStudentContext(req.auth!.userId);
    const result = await computeReadiness({ userId: req.auth!.userId, domain });
    res.json({ result });
  }),
);

async function activeDomain(userId: string) {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile?.activeDomain)
    throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
  return profile.activeDomain;
}

readinessRouter.get(
  "/latest",
  asyncHandler(async (req, res) => {
    const domain = await activeDomain(req.auth!.userId);
    const snap = await ReadinessSnapshot.findOne({ userId: req.auth!.userId, domain }).sort({
      createdAt: -1,
    });
    if (!snap) throw new AppError(404, "NO_READINESS", "Compute your readiness first.");
    res.json({ result: await describeSnapshot(snap) });
  }),
);

readinessRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const domain = await activeDomain(req.auth!.userId);
    const snaps = await ReadinessSnapshot.find({ userId: req.auth!.userId, domain })
      .sort({ createdAt: -1 })
      .limit(50);
    const points: ReadinessHistoryPoint[] = snaps.reverse().map((s) => ({
      id: String(s._id),
      score: s.score,
      isFallback: Boolean(s.isFallback),
      modelVersion: s.modelVersion,
      createdAt: s.createdAt.toISOString(),
    }));
    res.json({ domain, target: snaps.at(-1)?.target ?? null, points });
  }),
);
