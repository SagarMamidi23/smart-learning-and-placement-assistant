import { Router } from "express";
import { generatePathSchema, goalProgressSchema } from "@slp/shared";
import { loadStudentContext } from "../ai/context";
import { getLLM } from "../ai/llm";
import { buildLearningPathPrompt, learningPathSchema } from "../ai/prompts/learningPath";
import { aiLimiter } from "../ai/rateLimit";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import { LearningPath, toLearningPathDto, weekStatus } from "../models/LearningPath";
import { SkillGapReport } from "../models/SkillGapReport";
import { StudentProfile } from "../models/StudentProfile";

export const learningPathRouter = Router();
learningPathRouter.use(authenticate);

learningPathRouter.post(
  "/generate",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const { weeks = 8, hoursPerWeek = 8 } = parse(generatePathSchema, req.body ?? {});
    const { domain } = await loadStudentContext(userId);

    const report = await SkillGapReport.findOne({ userId, domain: domain.slug }).sort({
      createdAt: -1,
    });
    if (!report) {
      throw new AppError(
        409,
        "NO_SKILL_GAP",
        "Generate your skill-gap report first; the plan is built from it.",
      );
    }
    if (report.gaps.length === 0) {
      throw new AppError(
        422,
        "NOTHING_TO_LEARN",
        "Your profile already meets every benchmark for this domain.",
      );
    }

    const gaps = report.gaps.map((g) => ({
      skill: g.skill,
      currentLevel: g.currentLevel,
      targetLevel: g.targetLevel,
      priority: g.priority,
    }));
    const { system, prompt } = buildLearningPathPrompt({
      domainName: domain.name,
      safetyNotice: domain.safetyNotice ?? undefined,
      gaps,
      exams: domain.examCalendar.map((e) => e.name),
      weeks,
      hoursPerWeek,
    });
    const llm = getLLM();
    const out = await llm.generateJson({
      feature: "learning_path",
      system,
      prompt,
      schema: learningPathSchema(
        weeks,
        gaps.map((g) => g.skill),
      ),
      temperature: 0.4,
    });

    const latest = await LearningPath.findOne({ userId, domain: domain.slug }).sort({
      version: -1,
    });
    const path = await LearningPath.create({
      userId,
      domain: domain.slug,
      version: (latest?.version ?? 0) + 1,
      gapReportId: report._id,
      hoursPerWeek,
      llm: `${llm.info.provider}/${llm.info.model}`,
      weeks: out.weeks.map((w) => ({
        ...w,
        goals: w.goals.map((text) => ({ text, done: false })),
        status: "not-started",
      })),
    });
    res.status(201).json({ path: toLearningPathDto(path) });
  }),
);

async function latestPath(userId: string) {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile?.activeDomain)
    throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
  const path = await LearningPath.findOne({ userId, domain: profile.activeDomain }).sort({
    version: -1,
  });
  if (!path) throw new AppError(404, "NO_LEARNING_PATH", "Generate a learning path first.");
  return path;
}

learningPathRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ path: toLearningPathDto(await latestPath(req.auth!.userId)) });
  }),
);

/** Tick or untick one goal. Week status and overall completion follow from the goals. */
learningPathRouter.patch(
  "/progress",
  asyncHandler(async (req, res) => {
    const { week, goalIndex, done } = parse(goalProgressSchema, req.body);
    const path = await latestPath(req.auth!.userId);
    const target = path.weeks.find((w) => w.week === week);
    const goal = target?.goals[goalIndex];
    if (!target || !goal)
      throw new AppError(404, "GOAL_NOT_FOUND", "That week or goal does not exist.");
    goal.done = done;
    target.status = weekStatus(target.goals);
    await path.save();
    res.json({ path: toLearningPathDto(path) });
  }),
);
