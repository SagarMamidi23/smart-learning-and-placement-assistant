import { Router } from "express";
import {
  APPLICATION_STATUSES,
  createApplicationSchema,
  updateApplicationSchema,
  type AlertDto,
} from "@slp/shared";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import { Application, toApplicationDto } from "../models/Application";
import { Opportunity } from "../models/Opportunity";
import { objectId } from "./adminAssessments";

export const applicationsRouter = Router();
applicationsRouter.use(authenticate);

const DAY_MS = 86_400_000;
/** Alerts cover this many days ahead. */
export const ALERT_WINDOW_DAYS = 14;
const CLOSED = new Set(["rejected", "offered"]);

const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY_MS);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the student has tracked, with each opportunity attached. */
applicationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const apps = await Application.find({ userId: req.auth!.userId }).sort({ updatedAt: -1 });
    const opps = await Opportunity.find({ _id: { $in: apps.map((a) => a.opportunityId) } });
    const by = new Map(opps.map((o) => [String(o._id), o]));
    res.json({
      statuses: APPLICATION_STATUSES,
      applications: apps.map((a) => toApplicationDto(a, by.get(String(a.opportunityId)) ?? null)),
    });
  }),
);

/**
 * Upcoming deadlines and reminders. Computed on request rather than sent as emails or push messages: simple, always current,
 * and nothing to schedule. Closed applications (rejected / offered) raise no alerts.
 */
applicationsRouter.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const today = dayNumber(new Date());
    const apps = await Application.find({
      userId: req.auth!.userId,
      status: { $nin: [...CLOSED] },
    });
    const opps = await Opportunity.find({ _id: { $in: apps.map((a) => a.opportunityId) } });
    const by = new Map(opps.map((o) => [String(o._id), o]));
    const alerts: AlertDto[] = [];

    for (const a of apps) {
      const o = by.get(String(a.opportunityId));
      const title = o?.title ?? "Removed opportunity";
      // The opportunity's own deadline only matters until the student has applied.
      if (o?.deadline && a.status === "saved") {
        const daysLeft = dayNumber(o.deadline) - today;
        if (daysLeft < 0) {
          alerts.push({
            kind: "overdue",
            message: "Application deadline passed and you have not applied",
            date: iso(o.deadline),
            daysLeft,
            applicationId: String(a._id),
            opportunityTitle: title,
          });
        } else if (daysLeft <= ALERT_WINDOW_DAYS) {
          alerts.push({
            kind: "deadline",
            message: "Application deadline",
            date: iso(o.deadline),
            daysLeft,
            applicationId: String(a._id),
            opportunityTitle: title,
          });
        }
      }
      for (const d of a.deadlines as unknown as { label: string; date: Date }[]) {
        const daysLeft = dayNumber(d.date) - today;
        if (daysLeft >= 0 && daysLeft <= ALERT_WINDOW_DAYS) {
          alerts.push({
            kind: "custom",
            message: d.label,
            date: iso(d.date),
            daysLeft,
            applicationId: String(a._id),
            opportunityTitle: title,
          });
        }
      }
    }
    // Overdue first (most overdue at the top), then soonest.
    alerts.sort((x, y) => x.daysLeft - y.daysLeft);
    res.json({ alerts });
  }),
);

applicationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parse(createApplicationSchema, req.body);
    const opp = await Opportunity.findOne({ _id: input.opportunityId, isActive: true });
    if (!opp) throw new AppError(404, "NOT_FOUND", "Opportunity not found");
    const now = new Date();
    try {
      const a = await Application.create({
        userId: req.auth!.userId,
        opportunityId: opp._id,
        status: input.status,
        notes: input.notes,
        appliedAt: input.status === "applied" ? now : undefined,
        history: [{ status: input.status, at: now }],
      });
      res.status(201).json({ application: toApplicationDto(a, opp) });
    } catch (e) {
      if ((e as { code?: number }).code === 11000)
        throw new AppError(409, "ALREADY_TRACKED", "You are already tracking this opportunity.");
      throw e;
    }
  }),
);

applicationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const patch = parse(updateApplicationSchema, req.body);
    const a = await Application.findOne({ _id: objectId(req.params.id), userId: req.auth!.userId });
    if (!a) throw new AppError(404, "NOT_FOUND", "Application not found");

    if (patch.status && patch.status !== a.status) {
      a.status = patch.status;
      a.history.push({ status: patch.status, at: new Date() });
      if (patch.status === "applied" && !a.appliedAt) a.appliedAt = new Date();
    }
    if (patch.notes !== undefined) a.notes = patch.notes;
    if (patch.deadlines) {
      a.set(
        "deadlines",
        patch.deadlines.map((d) => ({ label: d.label, date: new Date(`${d.date}T00:00:00Z`) })),
      );
    }
    await a.save();
    const opp = await Opportunity.findById(a.opportunityId);
    res.json({ application: toApplicationDto(a, opp) });
  }),
);

applicationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await Application.deleteOne({
      _id: objectId(req.params.id),
      userId: req.auth!.userId,
    });
    if (r.deletedCount === 0) throw new AppError(404, "NOT_FOUND", "Application not found");
    res.status(204).end();
  }),
);
