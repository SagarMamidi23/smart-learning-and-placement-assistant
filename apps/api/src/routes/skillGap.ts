import { Router } from "express";
import { evidenceOf, loadStudentContext } from "../ai/context";
import { getLLM } from "../ai/llm";
import { buildSkillGapPrompt, skillGapSchema } from "../ai/prompts/skillGap";
import { hasEvidence } from "../ai/prompts/common";
import { aiLimiter } from "../ai/rateLimit";
import { scoreSkillGap } from "../ai/skillGapScoring";
import { AppError, asyncHandler } from "../errors";
import { authenticate } from "../middleware/auth";
import { LearningPath } from "../models/LearningPath";
import { SkillGapReport, toSkillGapDto } from "../models/SkillGapReport";
import { StudentProfile } from "../models/StudentProfile";

export const skillGapRouter = Router();
skillGapRouter.use(authenticate);

skillGapRouter.post(
  "/generate",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const { profile, domain } = await loadStudentContext(userId);
    const evidence = evidenceOf(profile);
    if (!hasEvidence(evidence)) {
      throw new AppError(
        422,
        "PROFILE_INCOMPLETE",
        "Add your education or skills, or upload a resume, so there is something to assess.",
      );
    }

    const benchmarks = domain.benchmarkSkills.map((s) => ({
      name: s.name,
      level: s.level,
      weight: s.weight,
    }));
    const { system, prompt } = buildSkillGapPrompt({
      domainName: domain.name,
      safetyNotice: domain.safetyNotice ?? undefined,
      benchmarks,
      profile: evidence,
    });
    const llm = getLLM();
    const out = await llm.generateJson({
      feature: "skill_gap",
      system,
      prompt,
      schema: skillGapSchema(benchmarks),
      temperature: 0.2,
    });

    const scored = scoreSkillGap(benchmarks, out.assessments);
    const report = await SkillGapReport.create({
      userId,
      domain: domain.slug,
      ...scored,
      summary: out.summary,
      usedResume: Boolean(evidence.resumeText?.trim()),
      llm: `${llm.info.provider}/${llm.info.model}`,
    });
    // A new report means the existing plan was built for different gaps.
    await LearningPath.updateMany(
      { userId, domain: domain.slug, stale: false },
      { $set: { stale: true } },
    );
    res.status(201).json({ report: toSkillGapDto(report) });
  }),
);

skillGapRouter.get(
  "/latest",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const profile = await StudentProfile.findOne({ userId });
    if (!profile?.activeDomain)
      throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
    const report = await SkillGapReport.findOne({ userId, domain: profile.activeDomain }).sort({
      createdAt: -1,
    });
    if (!report) throw new AppError(404, "NO_SKILL_GAP", "Generate a skill-gap report first.");
    res.json({ report: toSkillGapDto(report) });
  }),
);
