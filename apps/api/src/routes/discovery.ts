import { Router } from "express";
import { quizSubmitSchema, type DiscoveryResultDto } from "@slp/shared";
import { getLLM } from "../ai/llm";
import { evidenceOf } from "../ai/context";
import { aiLimiter } from "../ai/rateLimit";
import { buildDiscoveryPrompt, discoverySchema } from "../ai/prompts/discovery";
import { loadQuiz, resolveAnswers } from "../ai/quiz";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import { DomainConfig } from "../models/DomainConfig";
import { StudentProfile } from "../models/StudentProfile";

export const discoveryRouter = Router();
discoveryRouter.use(authenticate);

discoveryRouter.get("/quiz", (_req, res) => {
  res.json({ quiz: loadQuiz() });
});

discoveryRouter.post(
  "/result",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { answers } = parse(quizSubmitSchema, req.body);
    const quiz = loadQuiz();
    const lines = resolveAnswers(quiz, answers);

    const domains = await DomainConfig.find({ isActive: true })
      .select("slug name description")
      .sort({ name: 1 })
      .lean();
    if (domains.length === 0)
      throw new AppError(409, "NO_DOMAINS", "No career domains are available yet.");

    const userId = req.auth!.userId;
    const profile = await StudentProfile.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, new: true },
    );

    const { system, prompt } = buildDiscoveryPrompt({
      domains,
      profile: evidenceOf(profile),
      answers: lines,
    });
    const out = await getLLM().generateJson({
      feature: "career_discovery",
      system,
      prompt,
      schema: discoverySchema(domains),
    });

    const result: DiscoveryResultDto = {
      generatedAt: new Date().toISOString(),
      quizVersion: quiz.version,
      summary: out.summary,
      recommendations: out.recommendations,
    };
    profile.careerDiscoveryResult = result;
    await profile.save();
    res.json({ result });
  }),
);

discoveryRouter.get(
  "/result",
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findOne({ userId: req.auth!.userId });
    if (!profile?.careerDiscoveryResult) {
      throw new AppError(404, "NO_DISCOVERY_RESULT", "Take the discovery quiz first.");
    }
    res.json({ result: profile.careerDiscoveryResult });
  }),
);
