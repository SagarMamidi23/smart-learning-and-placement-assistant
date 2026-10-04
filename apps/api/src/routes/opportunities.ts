import { Router } from "express";
import { OPPORTUNITY_TYPES, opportunityInputSchema, opportunityUpdateSchema } from "@slp/shared";
import type { MatchesResponse } from "@slp/shared";
import { evidenceOf, loadStudentContext } from "../ai/context";
import { aiLimiter } from "../ai/rateLimit";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate, requireRole } from "../middleware/auth";
import { Application } from "../models/Application";
import { Opportunity, toOpportunityDto } from "../models/Opportunity";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { matchOpportunities } from "../opportunities/matching";
import { createOpportunity, reembedMissing, updateOpportunity } from "../opportunities/service";
import { objectId } from "./adminAssessments";

const DAY_MS = 86_400_000;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- students ----

export const opportunitiesRouter = Router();
opportunitiesRouter.use(authenticate);

/** Browse the student's domain (or any domain via ?domain=). Open opportunities only, soonest deadline first. */
opportunitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { isActive: true };
    const domain = typeof req.query.domain === "string" ? req.query.domain : undefined;
    filter.domain = domain ?? (await loadStudentContext(req.auth!.userId)).domain.slug;

    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type) {
      if (!(OPPORTUNITY_TYPES as readonly string[]).includes(type))
        throw new AppError(400, "BAD_TYPE", "Unknown opportunity type");
      filter.type = type;
    }
    if (req.query.includeExpired !== "true") {
      const today = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
      filter.$or = [{ deadline: null }, { deadline: { $gte: today } }];
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$and = [{ $or: [{ title: rx }, { organisation: rx }, { description: rx }] }];
    }
    const rows = await Opportunity.find(filter).sort({ deadline: 1, title: 1 }).limit(100).lean();
    // Dated ones first (soonest), undated after.
    rows.sort(
      (a, b) =>
        (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
    res.json({ opportunities: rows.map((o) => toOpportunityDto(o)) });
  }),
);

/** Personalised ranking with short explanations. Uses the LLM, so it shares the per-user AI limiter. */
opportunitiesRouter.get(
  "/matches",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const { profile, domain } = await loadStudentContext(userId);
    const types =
      typeof req.query.type === "string" && req.query.type ? [req.query.type] : undefined;

    const result = await matchOpportunities({
      userId,
      domain: { slug: domain.slug, name: domain.name, opportunityTypes: domain.opportunityTypes },
      profile: evidenceOf(profile),
      types,
    });

    const snap = await ReadinessSnapshot.findOne({ userId, domain: domain.slug }).sort({
      createdAt: -1,
    });
    const body: MatchesResponse = {
      ...result,
      readiness: snap
        ? { score: snap.score, target: snap.target, met: snap.score >= snap.target }
        : null,
    };
    res.json(body);
  }),
);

opportunitiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const o = await Opportunity.findOne({ _id: objectId(req.params.id), isActive: true });
    if (!o) throw new AppError(404, "NOT_FOUND", "Opportunity not found");
    res.json({ opportunity: toOpportunityDto(o) });
  }),
);

// ---- admin ----

export const adminOpportunitiesRouter = Router();
adminOpportunitiesRouter.use(authenticate, requireRole("admin"));

adminOpportunitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.domain === "string") filter.domain = req.query.domain;
    const rows = await Opportunity.find(filter).sort({ domain: 1, title: 1 }).limit(300);
    res.json({ opportunities: rows.map((o) => toOpportunityDto(o)) });
  }),
);

adminOpportunitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parse(opportunityInputSchema, req.body);
    const o = await createOpportunity(input, req.auth!.userId);
    res.status(201).json({ opportunity: toOpportunityDto(o) });
  }),
);

adminOpportunitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = parse(opportunityUpdateSchema, req.body);
    const o = await updateOpportunity(objectId(req.params.id), input);
    res.json({ opportunity: toOpportunityDto(o) });
  }),
);

/** Deleting also removes students' tracked applications to it, so nobody is left with a card pointing nowhere. */
adminOpportunitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = objectId(req.params.id);
    const o = await Opportunity.findByIdAndDelete(id);
    if (!o) throw new AppError(404, "NOT_FOUND", "Opportunity not found");
    await Application.deleteMany({ opportunityId: id });
    res.status(204).end();
  }),
);

/** Embeds opportunities that were saved while the embedding service was down. */
adminOpportunitiesRouter.post(
  "/reembed",
  asyncHandler(async (_req, res) => {
    res.json(await reembedMissing());
  }),
);
