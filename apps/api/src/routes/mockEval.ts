import { randomUUID } from "node:crypto";
import { Router } from "express";
import { startMockEvalSchema, submitMockEvalSchema } from "@slp/shared";
import { loadStudentContext } from "../ai/context";
import { getLLM } from "../ai/llm";
import {
  buildMockQuestionsPrompt,
  buildMockScoringPrompt,
  mockQuestionsSchema,
  mockScoreSchema,
  overallScore,
} from "../ai/prompts/mockEval";
import { aiLimiter } from "../ai/rateLimit";
import { config } from "../config";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import { MockEvaluation, toMockEvalDto } from "../models/MockEvaluation";
import { SkillGapReport } from "../models/SkillGapReport";
import { StudentProfile } from "../models/StudentProfile";
import { objectId } from "./adminAssessments";

export const mockEvalRouter = Router();
mockEvalRouter.use(authenticate);

/** Practice interviews and practical tasks, scored against the active domain's rubric. Text only for now. */
mockEvalRouter.post(
  "/start",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { questionCount = 4, mode = "text" } = parse(startMockEvalSchema, req.body ?? {});
    if (mode === "voice" && !config.voiceEnabled) {
      throw new AppError(
        403,
        "FEATURE_DISABLED",
        "Voice interviews are not enabled. Use the text mode.",
      );
    }
    const userId = req.auth!.userId;
    const { domain } = await loadStudentContext(userId);
    const mock = domain.mockEvaluation;
    if (!mock) {
      throw new AppError(409, "NO_MOCK_EVAL", "This domain has no mock evaluation configured.");
    }
    const rubric = mock.rubric.map((r) => ({
      criterion: r.criterion,
      weight: r.weight,
      description: r.description ?? undefined,
    }));

    // Lean on the student's weakest skills when there is a skill-gap report.
    const report = await SkillGapReport.findOne({ userId, domain: domain.slug }).sort({
      createdAt: -1,
    });
    const gaps = report?.gaps.slice(0, 5).map((g) => g.skill) ?? [];

    const { system, prompt } = buildMockQuestionsPrompt({
      domainName: domain.name,
      type: mock.type,
      safetyNotice: domain.safetyNotice ?? undefined,
      rubric,
      gaps,
      count: questionCount,
    });
    const llm = getLLM();
    const out = await llm.generateJson({
      feature: "mock_eval_questions",
      system,
      prompt,
      schema: mockQuestionsSchema(questionCount, rubric),
      temperature: 0.6,
    });

    const evaluation = await MockEvaluation.create({
      userId,
      domain: domain.slug,
      type: mock.type,
      mode,
      questions: out.questions.map((q) => ({ id: randomUUID(), ...q })),
      rubric,
      llm: `${llm.info.provider}/${llm.info.model}`,
    });
    res.status(201).json({ evaluation: toMockEvalDto(evaluation) });
  }),
);

mockEvalRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findOne({ userId: req.auth!.userId });
    if (!profile?.activeDomain)
      throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
    const items = await MockEvaluation.find({
      userId: req.auth!.userId,
      domain: profile.activeDomain,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({
      evaluations: items.map((m) => ({
        id: String(m._id),
        type: m.type,
        status: m.status,
        overallScore: m.overallScore ?? undefined,
        createdAt: m.createdAt.toISOString(),
        completedAt: m.completedAt?.toISOString(),
      })),
    });
  }),
);

async function ownEvaluation(req: { params: Record<string, unknown>; auth?: { userId: string } }) {
  const m = await MockEvaluation.findOne({
    _id: objectId(req.params.id),
    userId: req.auth!.userId,
  });
  if (!m) throw new AppError(404, "NOT_FOUND", "Evaluation not found");
  return m;
}

mockEvalRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ evaluation: toMockEvalDto(await ownEvaluation(req)) });
  }),
);

mockEvalRouter.post(
  "/:id/submit",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { answers } = parse(submitMockEvalSchema, req.body);
    const m = await ownEvaluation(req);
    if (m.status === "completed") {
      throw new AppError(409, "ALREADY_COMPLETED", "This evaluation was already scored.");
    }
    const ids = new Set(m.questions.map((q) => q.id));
    if (answers.some((a) => !ids.has(a.questionId))) {
      throw new AppError(
        400,
        "UNKNOWN_QUESTION",
        "An answer refers to a question that is not in this evaluation.",
      );
    }
    const byId = new Map(answers.map((a) => [a.questionId, a.text.trim()]));
    if (![...byId.values()].some(Boolean)) {
      throw new AppError(400, "NO_ANSWERS", "Answer at least one question before submitting.");
    }

    const { domain } = await loadStudentContext(req.auth!.userId).catch(() => ({ domain: null }));
    const rubric = m.rubric.map((r) => ({
      criterion: r.criterion!,
      weight: r.weight!,
      description: r.description ?? undefined,
    }));
    const items = m.questions.map((q) => ({
      id: q.id!,
      prompt: q.prompt!,
      answer: byId.get(q.id!) ?? "",
    }));
    const { system, prompt } = buildMockScoringPrompt({
      domainName: domain?.name ?? m.domain,
      type: m.type as "interview" | "practical-task",
      safetyNotice: domain?.safetyNotice ?? undefined,
      rubric,
      items,
    });
    const llm = getLLM();
    const out = await llm.generateJson({
      feature: "mock_eval_scoring",
      system,
      prompt,
      schema: mockScoreSchema(
        rubric,
        items.map((i) => i.id),
      ),
      temperature: 0.2,
    });

    const weights = new Map(rubric.map((r) => [r.criterion, r.weight]));
    const scores = out.rubricScores.map((r) => ({ ...r, weight: weights.get(r.criterion)! }));
    m.set({
      status: "completed",
      completedAt: new Date(),
      answers: items.map((i) => ({ questionId: i.id, text: i.answer })),
      rubricScores: scores,
      questionFeedback: out.questionFeedback,
      overallScore: overallScore(scores),
      feedback: { summary: out.summary, strengths: out.strengths, improvements: out.improvements },
      llm: `${llm.info.provider}/${llm.info.model}`,
    });
    await m.save();
    res.json({ evaluation: toMockEvalDto(m) });
  }),
);
