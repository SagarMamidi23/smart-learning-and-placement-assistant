import { Router } from "express";
import { Types } from "mongoose";
import { submitAttemptSchema, type AttemptDto, type Question } from "@slp/shared";
import { gradeAttempt, gradePractical } from "../ai/assessmentService";
import { aiLimiter } from "../ai/rateLimit";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import { Assessment, plainQuestions, toStudentQuestion, toSummaryDto } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { DomainConfig } from "../models/DomainConfig";
import { StudentProfile } from "../models/StudentProfile";
import { objectId } from "./adminAssessments";

export const assessmentsRouter = Router();
assessmentsRouter.use(authenticate);

async function activeDomainOf(userId: string) {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile?.activeDomain)
    throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
  return profile.activeDomain;
}

type AttemptDoc = InstanceType<typeof AssessmentAttempt>;

/** Questions never carry answer keys. Results (with keys and explanations) appear only once submitted. */
function toAttemptDto(
  attempt: AttemptDoc,
  assessment: { questions: unknown; timeLimitMinutes: number },
  results?: AttemptDto["results"],
): AttemptDto {
  const questions = plainQuestions(assessment);
  return {
    id: String(attempt._id),
    assessmentId: String(attempt.assessmentId),
    status: attempt.status as AttemptDto["status"],
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString(),
    timeTakenSec: attempt.timeTakenSec ?? undefined,
    timeLimitMinutes: assessment.timeLimitMinutes,
    score: attempt.score ?? undefined,
    questions: questions.map(toStudentQuestion),
    results,
  };
}

/** Rebuilds the revealed per-question results of a submitted attempt from the saved answers and grades. */
function resultsOf(attempt: AttemptDoc, questions: Question[]) {
  const answers = attempt.answers.map((a) => ({
    questionId: a.questionId!,
    selected: a.selected ?? undefined,
    text: a.text ?? undefined,
  }));
  const grades = attempt.results.map((r) => ({
    questionId: r.questionId!,
    awarded: r.awarded ?? 0,
    feedback: r.feedback ?? "",
  }));
  return gradeAttempt(questions, answers, grades).results;
}

assessmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const domain = await activeDomainOf(userId);
    const items = await Assessment.find({ domain, status: "published" }).sort({ publishedAt: -1 });
    const stats = await AssessmentAttempt.aggregate<{ _id: unknown; best: number; n: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          status: "submitted",
          assessmentId: { $in: items.map((i) => i._id) },
        },
      },
      { $group: { _id: "$assessmentId", best: { $max: "$score" }, n: { $sum: 1 } } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    res.json({
      assessments: items.map((i) => ({
        ...toSummaryDto(i),
        bestScore: byId.get(String(i._id))?.best,
        attempts: byId.get(String(i._id))?.n ?? 0,
      })),
    });
  }),
);

assessmentsRouter.get(
  "/attempts",
  asyncHandler(async (req, res) => {
    const attempts = await AssessmentAttempt.find({ userId: req.auth!.userId, status: "submitted" })
      .sort({ submittedAt: -1 })
      .limit(50);
    const titles = new Map(
      (
        await Assessment.find({ _id: { $in: attempts.map((a) => a.assessmentId) } }).select("title")
      ).map((a) => [String(a._id), a.title]),
    );
    res.json({
      attempts: attempts.map((a) => ({
        id: String(a._id),
        assessmentId: String(a.assessmentId),
        title: titles.get(String(a.assessmentId)) ?? "Assessment",
        domain: a.domain,
        score: a.score,
        timeTakenSec: a.timeTakenSec,
        submittedAt: a.submittedAt?.toISOString(),
      })),
    });
  }),
);

assessmentsRouter.get(
  "/attempts/:attemptId",
  asyncHandler(async (req, res) => {
    const attempt = await AssessmentAttempt.findOne({
      _id: objectId(req.params.attemptId),
      userId: req.auth!.userId,
    });
    const assessment = attempt && (await Assessment.findById(attempt.assessmentId));
    if (!attempt || !assessment) throw new AppError(404, "NOT_FOUND", "Attempt not found");
    const results =
      attempt.status === "submitted" ? resultsOf(attempt, plainQuestions(assessment)) : undefined;
    res.json({ attempt: toAttemptDto(attempt, assessment, results) });
  }),
);

assessmentsRouter.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const domain = await activeDomainOf(userId);
    const assessment = await Assessment.findOne({
      _id: objectId(req.params.id),
      status: "published",
      domain,
    });
    if (!assessment) throw new AppError(404, "NOT_FOUND", "Assessment not found");

    // Resume an unfinished attempt instead of starting a second clock.
    let attempt = await AssessmentAttempt.findOne({
      userId,
      assessmentId: assessment._id,
      status: "in-progress",
    });
    const created = !attempt;
    attempt ??= await AssessmentAttempt.create({ userId, assessmentId: assessment._id, domain });
    res.status(created ? 201 : 200).json({ attempt: toAttemptDto(attempt, assessment) });
  }),
);

assessmentsRouter.post(
  "/attempts/:attemptId/submit",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { answers } = parse(submitAttemptSchema, req.body);
    const attempt = await AssessmentAttempt.findOne({
      _id: objectId(req.params.attemptId),
      userId: req.auth!.userId,
    });
    const assessment = attempt && (await Assessment.findById(attempt.assessmentId));
    if (!attempt || !assessment) throw new AppError(404, "NOT_FOUND", "Attempt not found");
    if (attempt.status === "submitted")
      throw new AppError(409, "ALREADY_SUBMITTED", "This attempt was already submitted.");

    const questions = plainQuestions(assessment);
    const ids = new Set(questions.map((q) => q.id));
    const unknown = answers.filter((a) => !ids.has(a.questionId));
    if (unknown.length)
      throw new AppError(
        400,
        "UNKNOWN_QUESTION",
        "An answer refers to a question that is not in this assessment.",
      );

    // Last answer wins; keep only the field that matches each question's kind.
    const kind = new Map(questions.map((q) => [q.id, q.kind]));
    const clean = [...new Map(answers.map((a) => [a.questionId, a])).values()].map((a) =>
      kind.get(a.questionId) === "mcq"
        ? { questionId: a.questionId, selected: a.selected }
        : { questionId: a.questionId, text: a.text?.trim() },
    );

    const domain = await DomainConfig.findOne({ slug: attempt.domain });
    // Practical grading can fail (LLM busy); the attempt then stays open and nothing is lost.
    const grades = await gradePractical(
      { name: domain?.name ?? attempt.domain, safetyNotice: domain?.safetyNotice },
      questions,
      clean,
    );
    const graded = gradeAttempt(questions, clean, grades);

    const now = new Date();
    attempt.set({
      status: "submitted",
      submittedAt: now,
      timeTakenSec: Math.max(0, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000)),
      answers: clean,
      results: graded.results.map((r) => ({
        questionId: r.questionId,
        correct: r.correct,
        awarded: r.awarded,
        max: r.max,
        feedback: r.feedback,
      })),
      score: graded.score,
    });
    await attempt.save();
    res.json({ attempt: toAttemptDto(attempt, assessment, graded.results) });
  }),
);
