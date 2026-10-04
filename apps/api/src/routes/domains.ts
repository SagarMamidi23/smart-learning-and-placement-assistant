import { Router } from "express";
import { domainConfigSchema, domainUpdateSchema, slugSchema } from "@slp/shared";
import { AppError, asyncHandler, parse } from "../errors";
import { DomainConfig, toDomainDetail, toSummary } from "../models/DomainConfig";
import { StudentProfile } from "../models/StudentProfile";
import { authenticate, requireRole } from "../middleware/auth";

/** Public: active domains only. Domains are data, so a new domain appears here with no code change. */
export const domainsRouter = Router();

domainsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const domains = await DomainConfig.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json({ domains: domains.map(toSummary) });
  }),
);

domainsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = parse(slugSchema, req.params.slug);
    const domain = await DomainConfig.findOne({ slug, isActive: true }).lean();
    if (!domain) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    res.json({ domain: toDomainDetail(domain) });
  }),
);

/** Admin CRUD, including inactive domains. */
export const adminDomainsRouter = Router();
adminDomainsRouter.use(authenticate, requireRole("admin"));

adminDomainsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const domains = await DomainConfig.find().sort({ name: 1 }).lean();
    res.json({ domains: domains.map(toSummary) });
  }),
);

adminDomainsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = parse(slugSchema, req.params.slug);
    const domain = await DomainConfig.findOne({ slug }).lean();
    if (!domain) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    res.json({ domain: toDomainDetail(domain) });
  }),
);

adminDomainsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parse(domainConfigSchema, req.body);
    try {
      const created = await DomainConfig.create(input);
      res.status(201).json({ domain: toDomainDetail(created.toObject()) });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        throw new AppError(
          409,
          "DOMAIN_EXISTS",
          `A domain with slug "${input.slug}" already exists`,
        );
      }
      throw e;
    }
  }),
);

adminDomainsRouter.put(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = parse(slugSchema, req.params.slug);
    const input = parse(domainUpdateSchema, req.body);
    const updated = await DomainConfig.findOneAndReplace(
      { slug },
      { slug, ...input },
      { new: true },
    );
    if (!updated) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    res.json({ domain: toDomainDetail(updated.toObject()) });
  }),
);

adminDomainsRouter.delete(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = parse(slugSchema, req.params.slug);
    const inUse = await StudentProfile.countDocuments({ activeDomain: slug });
    if (inUse > 0) {
      throw new AppError(
        409,
        "DOMAIN_IN_USE",
        `${inUse} student(s) have this as their active domain. Deactivate it instead of deleting.`,
      );
    }
    const deleted = await DomainConfig.findOneAndDelete({ slug });
    if (!deleted) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    res.status(204).end();
  }),
);
