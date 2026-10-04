import { Router } from "express";
import { buildAnalytics } from "../analytics/service";
import { asyncHandler } from "../errors";
import { authenticate, requireRole } from "../middleware/auth";

export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(authenticate, requireRole("admin"));

/** Cohort-level usage and readiness figures. Aggregates only: no student is identifiable from this response. */
adminAnalyticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.days);
    const days = Number.isInteger(raw) && raw >= 1 && raw <= 365 ? raw : 30;
    res.json({ analytics: await buildAnalytics(new Date(), days) });
  }),
);
