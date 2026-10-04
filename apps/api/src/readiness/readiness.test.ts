import request from "supertest";
import type { ReadinessFeatures } from "@slp/shared";
import { seedDomains } from "../domains/seed";
import { Assessment } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { LearningPath } from "../models/LearningPath";
import { MentorChat } from "../models/MentorChat";
import { MockEvaluation } from "../models/MockEvaluation";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { SkillGapReport } from "../models/SkillGapReport";
import { User } from "../models/User";
import { app, registerAgent, setupDb, teardownDb } from "../test/helpers";
import { extractFeatures } from "./features";
import { FALLBACK_VERSION, FALLBACK_WEIGHTS, fallbackScore, normalise } from "./fallback";
import { MlReadinessClient, setPredictor, type ReadinessPredictor } from "./mlClient";
import { nextActionsFor } from "./service";

const F = (over: Partial<ReadinessFeatures> = {}): ReadinessFeatures => ({
  assessment_avg: 0,
  mock_eval_avg: 0,
  path_completion_pct: 0,
  skill_gap_coverage_pct: 0,
  mentor_engagement: 0,
  days_active: 0,
  recency_days: 60,
  ...over,
});
const PERFECT = F({
  assessment_avg: 100,
  mock_eval_avg: 100,
  path_completion_pct: 100,
  skill_gap_coverage_pct: 100,
  mentor_engagement: 50,
  days_active: 30,
  recency_days: 0,
});

describe("fallback formula", () => {
  it("has weights that sum to 1 and spans 0 to 100", () => {
    expect(Object.values(FALLBACK_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(fallbackScore(F()).score).toBe(0);
    expect(fallbackScore(PERFECT).score).toBe(100);
  });

  it("rises with each positive signal and with recency", () => {
    const base = fallbackScore(F({ recency_days: 30 })).score;
    for (const k of [
      "assessment_avg",
      "mock_eval_avg",
      "path_completion_pct",
      "skill_gap_coverage_pct",
      "mentor_engagement",
      "days_active",
    ] as const) {
      expect(fallbackScore(F({ recency_days: 30, [k]: 50 })).score).toBeGreaterThan(base);
    }
    expect(fallbackScore(F({ recency_days: 5 })).score).toBeGreaterThan(base);
  });

  it("saturates the engagement signals and clamps odd inputs", () => {
    expect(normalise(F({ mentor_engagement: 500, days_active: 99 })).mentor_engagement).toBe(1);
    expect(normalise(F({ recency_days: 500 })).recency_days).toBe(0);
    expect(normalise(F({ assessment_avg: -5 })).assessment_avg).toBe(0);
  });

  it("explains itself with the three largest effects, signed", () => {
    const { factors } = fallbackScore(
      F({ assessment_avg: 95, mock_eval_avg: 0, days_active: 1, recency_days: 55 }),
    );
    expect(factors).toHaveLength(3);
    const sizes = factors.map((f) => Math.abs(f.impact));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(factors.find((f) => f.feature === "assessment_avg")?.direction).toBe("raises");
    expect(factors.find((f) => f.feature === "mock_eval_avg")?.direction).toBe("lowers");
  });
});

describe("next actions", () => {
  const none = {
    assessments: false,
    mockEvaluations: false,
    learningPath: false,
    skillGap: false,
    mentor: false,
  };

  it("starts a new student at the beginning of the journey, capped at four", () => {
    const a = nextActionsFor(F(), none, "learning");
    expect(a).toHaveLength(4);
    expect(a[0].href).toBe("/skill-gap");
    expect(a.map((x) => x.href)).toContain("/learning-path");
  });

  it("targets weak spots once evidence exists, and sends strong students to opportunities", () => {
    const all = {
      assessments: true,
      mockEvaluations: true,
      learningPath: true,
      skillGap: true,
      mentor: true,
    };
    const weak = nextActionsFor(
      F({ assessment_avg: 40, mock_eval_avg: 30, path_completion_pct: 20, days_active: 3 }),
      all,
      "learning",
    );
    expect(weak.map((a) => a.label).join(" ")).toMatch(/Retake assessments/);
    expect(weak.map((a) => a.label).join(" ")).toMatch(/learning path/);
    expect(nextActionsFor(PERFECT, all, "opportunities")).toEqual([
      { label: "Browse opportunities that match your profile", href: "/opportunities" },
    ]);
  });
});

describe("MlReadinessClient", () => {
  const good = {
    score: 72.4,
    model_version: "readiness-rf-1",
    top_factors: [
      {
        feature: "assessment_avg",
        label: "x",
        value: 80,
        typical: 40,
        impact: 9.1,
        direction: "raises",
      },
      { feature: "mystery_feature", value: 1, typical: 1, impact: 1, direction: "raises" },
    ],
  };
  const reply = (body: unknown, status = 200) =>
    jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("sends the features and maps the reply, dropping factors it does not recognise", async () => {
    const fetchImpl = reply(good);
    const out = await new MlReadinessClient("http://ml:8000", fetchImpl as never).predict(PERFECT);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://ml:8000/predict");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(PERFECT);
    expect(out).toMatchObject({ score: 72.4, modelVersion: "readiness-rf-1" });
    expect(out!.factors).toHaveLength(1);
    expect(out!.factors[0].label).toBe("Assessment results");
  });

  it.each([
    ["a 500", () => reply({ detail: "boom" }, 500)],
    ["a 503 (no model loaded)", () => reply({ detail: "no model" }, 503)],
    ["an impossible score", () => reply({ ...good, score: 150 })],
    ["a malformed body", () => reply({ nope: true })],
    ["a network error", () => jest.fn().mockRejectedValue(new Error("ECONNREFUSED"))],
  ])("returns null for %s so the caller can fall back", async (_label, make) => {
    expect(await new MlReadinessClient("http://ml", make() as never).predict(PERFECT)).toBeNull();
  });
});

describe("feature extraction", () => {
  const NOW = new Date("2026-10-15T12:00:00Z");
  const daysAgo = (n: number, hour = 9) =>
    new Date(NOW.getTime() - n * 86_400_000 + (hour - 12) * 3_600_000);

  beforeAll(async () => {
    await setupDb();
    await seedDomains();
  });
  afterAll(teardownDb);

  async function newUser() {
    const { email } = await registerAgent();
    return String((await User.findOne({ email }))!._id);
  }

  it("is all zeros, with recency at its maximum, for a student who has done nothing", async () => {
    const { features, evidence } = await extractFeatures(await newUser(), "software", NOW);
    expect(features).toEqual(F());
    expect(Object.values(evidence).some(Boolean)).toBe(false);
  });

  it("computes each signal from what was recorded", async () => {
    const userId = await newUser();
    const [a1, a2] = await Assessment.insertMany(
      ["A", "B"].map((t) => ({
        domain: "software",
        title: `Test ${t} title`,
        type: "mcq",
        status: "published",
      })),
    );
    const attempt = (assessmentId: unknown, score: number, when: Date) => ({
      userId,
      assessmentId,
      domain: "software",
      status: "submitted",
      score,
      submittedAt: when,
    });
    await AssessmentAttempt.insertMany([
      attempt(a1._id, 40, daysAgo(10)),
      attempt(a1._id, 80, daysAgo(2)), // retake: the best score counts, not the average of attempts
      attempt(a2._id, 60, daysAgo(2)),
      { ...attempt(a2._id, 99, daysAgo(1)), status: "in-progress" }, // unfinished attempts never count
    ]);
    await MockEvaluation.insertMany([
      {
        userId,
        domain: "software",
        type: "interview",
        status: "completed",
        overallScore: 50,
        completedAt: daysAgo(5),
        questions: [],
        rubric: [],
      },
      {
        userId,
        domain: "software",
        type: "interview",
        status: "completed",
        overallScore: 70,
        completedAt: daysAgo(5),
        questions: [],
        rubric: [],
      },
      {
        userId,
        domain: "software",
        type: "interview",
        status: "in-progress",
        questions: [],
        rubric: [],
      },
    ]);
    await SkillGapReport.create({
      userId,
      domain: "software",
      coverage: 41.5,
      summary: "x".repeat(25),
      strengths: [],
      gaps: [],
    });
    await SkillGapReport.collection.updateOne(
      { userId: new (await import("mongoose")).Types.ObjectId(userId) },
      { $set: { createdAt: daysAgo(12) } },
    );
    await MentorChat.create({
      userId,
      domain: "software",
      messages: [
        { role: "user", content: "old question", createdAt: daysAgo(45) }, // outside the 30-day window
        { role: "assistant", content: "answer", createdAt: daysAgo(3) }, // only the student's own questions count
        { role: "user", content: "q1", createdAt: daysAgo(3) },
        { role: "user", content: "q2", createdAt: daysAgo(3, 15) },
      ],
    });

    const { features, evidence } = await extractFeatures(userId, "software", NOW);
    expect(features.assessment_avg).toBe(70); // (80 + 60) / 2
    expect(features.mock_eval_avg).toBe(60);
    expect(features.skill_gap_coverage_pct).toBe(41.5);
    expect(features.mentor_engagement).toBe(2);
    // Distinct active days in the window: 10, 2, 5, 12 and 3 days ago.
    expect(features.days_active).toBe(5);
    expect(features.recency_days).toBe(2);
    expect(evidence).toEqual({
      assessments: true,
      mockEvaluations: true,
      learningPath: false,
      skillGap: true,
      mentor: true,
    });
  });

  it("reads learning-path completion and ignores other domains and other students", async () => {
    const userId = await newUser();
    const other = await newUser();
    const week = (done: boolean[]) => ({
      week: 1,
      title: "W",
      status: "in-progress",
      goals: done.map((d) => ({ text: "g", done: d })),
      topics: [],
      resources: [],
      focusSkills: [],
    });
    await LearningPath.create({
      userId,
      domain: "software",
      version: 1,
      gapReportId: userId,
      hoursPerWeek: 8,
      weeks: [week([true, true, false, false])],
    });
    await LearningPath.create({
      userId: other,
      domain: "software",
      version: 1,
      gapReportId: other,
      hoursPerWeek: 8,
      weeks: [week([true, true, true, true])],
    });
    await LearningPath.create({
      userId,
      domain: "civil",
      version: 1,
      gapReportId: userId,
      hoursPerWeek: 8,
      weeks: [week([true, true, true, true])],
    });

    const { features, evidence } = await extractFeatures(userId, "software", new Date());
    expect(features.path_completion_pct).toBe(50);
    expect(evidence.learningPath).toBe(true);
    expect((await extractFeatures(userId, "law", new Date())).features.path_completion_pct).toBe(0);
  });

  it("caps mentor engagement at 50", async () => {
    const userId = await newUser();
    await MentorChat.create({
      userId,
      domain: "software",
      messages: Array.from({ length: 70 }, (_, i) => ({
        role: "user",
        content: `q${i}`,
        createdAt: daysAgo(1),
      })),
    });
    expect((await extractFeatures(userId, "software", NOW)).features.mentor_engagement).toBe(50);
  });
});

describe("readiness endpoints", () => {
  beforeAll(async () => {
    await setupDb();
    await seedDomains();
  });
  afterAll(teardownDb);
  beforeEach(async () => {
    await ReadinessSnapshot.deleteMany({});
  });
  afterEach(() => setPredictor(undefined));

  const mlReturning = (score: number): ReadinessPredictor & { calls: ReadinessFeatures[] } => {
    const calls: ReadinessFeatures[] = [];
    return {
      calls,
      predict: async (f) => {
        calls.push(f);
        return {
          score,
          modelVersion: "readiness-test-1",
          factors: [
            {
              feature: "assessment_avg",
              label: "Assessment results",
              value: f.assessment_avg,
              typical: 50,
              impact: 4.2,
              direction: "raises",
            },
          ],
        };
      },
    };
  };
  const down: ReadinessPredictor = { predict: async () => null };

  async function student(domain = "software") {
    const { agent, email } = await registerAgent();
    await agent.put("/api/v1/profile/domain").send({ slug: domain });
    return { agent, userId: String((await User.findOne({ email }))!._id) };
  }

  it("needs sign-in and a domain", async () => {
    expect((await request(app).post("/api/v1/readiness/compute")).status).toBe(401);
    const { agent } = await registerAgent();
    expect((await agent.post("/api/v1/readiness/compute")).body.error.code).toBe(
      "NO_ACTIVE_DOMAIN",
    );
    expect((await agent.get("/api/v1/readiness/history")).status).toBe(409);
  });

  it("uses the ML service's score and says which model made it", async () => {
    const ml = mlReturning(81.3);
    setPredictor(ml);
    const { agent } = await student();
    const res = await agent.post("/api/v1/readiness/compute");
    expect(res.status).toBe(200);
    const r = res.body.result;
    expect(r).toMatchObject({
      score: 81.3,
      modelVersion: "readiness-test-1",
      isFallback: false,
      domain: "software",
      target: 70,
    });
    expect(r.factors[0].label).toBe("Assessment results");
    expect(ml.calls).toHaveLength(1);
    expect(ml.calls[0]).toEqual(F()); // a brand-new student: no evidence at all
  });

  it("at or above the target: opportunities. Below it: back to learning with focus areas", async () => {
    const hi = await student();
    setPredictor(mlReturning(70)); // exactly the software target of 70
    const up = (await hi.agent.post("/api/v1/readiness/compute")).body.result;
    expect(up.decision).toBe("opportunities");
    expect(up.focusAreas).toEqual([]);
    expect(up.nextActions[0].href).toBe("/opportunities");

    const lo = await student();
    await SkillGapReport.create({
      userId: lo.userId,
      domain: "software",
      coverage: 30,
      summary: "x".repeat(25),
      strengths: [],
      gaps: [
        { skill: "Databases and SQL", currentLevel: 0, targetLevel: 3, priority: "high" },
        { skill: "Operating Systems", currentLevel: 1, targetLevel: 3, priority: "medium" },
      ],
    });
    setPredictor(mlReturning(69.9));
    const down1 = (await lo.agent.post("/api/v1/readiness/compute")).body.result;
    expect(down1.decision).toBe("learning");
    expect(down1.focusAreas.map((f: { skill: string }) => f.skill)).toEqual([
      "Databases and SQL",
      "Operating Systems",
    ]);
    expect(down1.nextActions.length).toBeGreaterThan(0);
    expect(down1.nextActions.every((a: { href: string }) => a.href !== "/opportunities")).toBe(
      true,
    );
  });

  it("falls back to the weighted formula when the ML service is down, and flags it", async () => {
    setPredictor(down);
    const { agent } = await student();
    const res = await agent.post("/api/v1/readiness/compute");
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ isFallback: true, modelVersion: FALLBACK_VERSION });
    expect(res.body.result.score).toBe(fallbackScore(F()).score);
    expect(res.body.result.factors.length).toBeGreaterThan(0);
  });

  it("stores the exact inputs and result so the model can be retrained later", async () => {
    setPredictor(mlReturning(55));
    const { agent, userId } = await student();
    await agent.post("/api/v1/readiness/compute");
    const snap = (await ReadinessSnapshot.findOne({ userId }))!.toObject();
    expect(snap).toMatchObject({
      domain: "software",
      score: 55,
      modelVersion: "readiness-test-1",
      isFallback: false,
      target: 70,
      decision: "learning",
    });
    expect(snap.features).toEqual(F());
  });

  it("reuses a snapshot computed a moment ago when nothing has changed, but not when something has", async () => {
    const ml = mlReturning(60);
    setPredictor(ml);
    const { agent, userId } = await student();
    const first = (await agent.post("/api/v1/readiness/compute")).body.result;
    const again = (await agent.post("/api/v1/readiness/compute")).body.result;
    expect(again.id).toBe(first.id);
    expect(ml.calls).toHaveLength(1);

    await SkillGapReport.create({
      userId,
      domain: "software",
      coverage: 55,
      summary: "x".repeat(25),
      strengths: [],
      gaps: [],
    });
    const changed = (await agent.post("/api/v1/readiness/compute")).body.result;
    expect(changed.id).not.toBe(first.id);
    expect(changed.features.skill_gap_coverage_pct).toBe(55);
    expect(await ReadinessSnapshot.countDocuments({ userId })).toBe(2);
  });

  it("returns the latest result and the history oldest first, with the target", async () => {
    const { agent, userId } = await student();
    expect((await agent.get("/api/v1/readiness/latest")).body.error.code).toBe("NO_READINESS");
    setPredictor(mlReturning(40));
    await agent.post("/api/v1/readiness/compute");
    await ReadinessSnapshot.updateOne(
      { userId },
      { $set: { createdAt: new Date(Date.now() - 3_600_000) } },
    );
    await SkillGapReport.create({
      userId,
      domain: "software",
      coverage: 10,
      summary: "x".repeat(25),
      strengths: [],
      gaps: [],
    });
    setPredictor(mlReturning(65));
    await agent.post("/api/v1/readiness/compute");

    expect((await agent.get("/api/v1/readiness/latest")).body.result.score).toBe(65);
    const h = (await agent.get("/api/v1/readiness/history")).body;
    expect(h.points.map((p: { score: number }) => p.score)).toEqual([40, 65]);
    expect(h.target).toBe(70);
  });

  it("keeps students' snapshots separate and per domain", async () => {
    setPredictor(mlReturning(50));
    const a = await student("software");
    const b = await student("software");
    await a.agent.post("/api/v1/readiness/compute");
    expect((await b.agent.get("/api/v1/readiness/history")).body.points).toEqual([]);
    await a.agent.put("/api/v1/profile/domain").send({ slug: "civil" });
    expect((await a.agent.get("/api/v1/readiness/history")).body.points).toEqual([]); // civil has none yet
  });
});
