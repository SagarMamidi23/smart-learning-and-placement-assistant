import { Router } from "express";
import {
  MIN_QUESTIONS_TO_PUBLISH,
  assessmentContentSchema,
  generateAssessmentSchema,
} from "@slp/shared";
import { generateDraft } from "../ai/assessmentService";
import { aiLimiter } from "../ai/rateLimit";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate, requireRole } from "../middleware/auth";
import { Assessment, plainQuestions, toSummaryDto } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { DomainConfig } from "../models/DomainConfig";

/** Admin review flow: generate a draft, edit it, publish it. Students only ever see published assessments. */
export const adminAssessmentsRouter = Router();
adminAssessmentsRouter.use(authenticate, requireRole("admin"));

export const objectId = (v: unknown) => {
  const id = String(v);
  if (!/^[0-9a-f]{24}$/.test(id)) throw new AppError(400, "BAD_ID", "Invalid id");
  return id;
};

/** Full admin view: includes answer keys, explanations and provenance. */
function toAdminDto(a: unknown) {
  const doc = a as {
    questions: unknown;
    origin?: string;
    llm?: string;
    groundedOn?: string[];
    reviewedBy?: unknown;
  };
  return {
    ...toSummaryDto(a),
    questions: plainQuestions(doc),
    origin: doc.origin,
    llm: doc.llm,
    groundedOn: doc.groundedOn ?? [],
    reviewed: Boolean(doc.reviewedBy),
  };
}

async function loadAssessment(id: unknown) {
  const a = await Assessment.findById(objectId(id));
  if (!a) throw new AppError(404, "NOT_FOUND", "Assessment not found");
  return a;
}

adminAssessmentsRouter.post(
  "/generate",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(generateAssessmentSchema, req.body);
    const domain = await DomainConfig.findOne({ slug: input.domain }).lean();
    if (!domain) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    const draft = await generateDraft({
      domain,
      input: { ...input, count: input.count, practicalCount: input.practicalCount },
      userId: req.auth!.userId,
    });
    res.status(201).json({ assessment: toAdminDto(draft) });
  }),
);

adminAssessmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter: Record<string, string> = {};
    if (typeof req.query.domain === "string") filter.domain = req.query.domain;
    if (req.query.status === "draft" || req.query.status === "published")
      filter.status = req.query.status;
    const items = await Assessment.find(filter).sort({ createdAt: -1 });
    res.json({ assessments: items.map(toSummaryDto) });
  }),
);

adminAssessmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ assessment: toAdminDto(await loadAssessment(req.params.id)) });
  }),
);

adminAssessmentsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const a = await loadAssessment(req.params.id);
    if (a.status === "published") {
      throw new AppError(
        409,
        "ASSESSMENT_PUBLISHED",
        "Published assessments can't be edited. Unpublish or duplicate it first.",
      );
    }
    const content = parse(assessmentContentSchema, req.body);
    a.title = content.title;
    a.type = content.type;
    a.timeLimitMinutes = content.timeLimitMinutes;
    a.set("questions", content.questions);
    await a.save();
    res.json({ assessment: toAdminDto(a) });
  }),
);

adminAssessmentsRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const a = await loadAssessment(req.params.id);
    if (a.status === "published") throw new AppError(409, "ALREADY_PUBLISHED", "Already published");
    // Re-validate what is stored: the reviewer may have left an invalid or half-edited draft.
    const content = parse(assessmentContentSchema, {
      title: a.title,
      type: a.type,
      timeLimitMinutes: a.timeLimitMinutes,
      questions: plainQuestions(a),
    });
    if (content.questions.length < MIN_QUESTIONS_TO_PUBLISH) {
      throw new AppError(
        400,
        "TOO_FEW_QUESTIONS",
        `Publish needs at least ${MIN_QUESTIONS_TO_PUBLISH} questions.`,
      );
    }
    const domain = await DomainConfig.findOne({ slug: a.domain });
    if (!domain?.assessmentTypes.includes(a.type)) {
      throw new AppError(
        400,
        "TYPE_NOT_SUPPORTED",
        `This domain does not use "${a.type}" assessments.`,
      );
    }
    a.status = "published";
    a.reviewedBy = req.auth!.userId as never;
    a.publishedAt = new Date();
    await a.save();
    res.json({ assessment: toAdminDto(a) });
  }),
);

adminAssessmentsRouter.post(
  "/:id/unpublish",
  asyncHandler(async (req, res) => {
    const a = await loadAssessment(req.params.id);
    if (await AssessmentAttempt.exists({ assessmentId: a._id })) {
      throw new AppError(
        409,
        "HAS_ATTEMPTS",
        "Students have attempted this. Duplicate it to make changes instead.",
      );
    }
    a.status = "draft";
    a.publishedAt = undefined;
    await a.save();
    res.json({ assessment: toAdminDto(a) });
  }),
);

adminAssessmentsRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const a = await loadAssessment(req.params.id);
    const copy = await Assessment.create({
      domain: a.domain,
      title: `${a.title} (copy)`.slice(0, 150),
      type: a.type,
      status: "draft",
      questions: plainQuestions(a),
      timeLimitMinutes: a.timeLimitMinutes,
      grounded: a.grounded,
      groundedOn: a.groundedOn,
      origin: a.origin,
      llm: a.llm,
      createdBy: req.auth!.userId,
    });
    res.status(201).json({ assessment: toAdminDto(copy) });
  }),
);

adminAssessmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const a = await loadAssessment(req.params.id);
    if (await AssessmentAttempt.exists({ assessmentId: a._id })) {
      throw new AppError(
        409,
        "HAS_ATTEMPTS",
        "Students have attempted this, so it can't be deleted.",
      );
    }
    await a.deleteOne();
    res.status(204).end();
  }),
);
