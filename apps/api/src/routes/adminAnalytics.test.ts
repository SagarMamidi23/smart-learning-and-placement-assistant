import mongoose from "mongoose";
import { seedDomains } from "../domains/seed";
import { Application } from "../models/Application";
import { Assessment } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { MentorChat } from "../models/MentorChat";
import { Opportunity } from "../models/Opportunity";
import { ReadinessSnapshot } from "../models/ReadinessSnapshot";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { adminAgent, registerAgent, setupDb, teardownDb } from "../test/helpers";

beforeAll(async () => {
  await setupDb();
  await seedDomains();
});
afterAll(teardownDb);
beforeEach(async () => {
  await Promise.all(
    [
      User,
      StudentProfile,
      ReadinessSnapshot,
      Assessment,
      AssessmentAttempt,
      MentorChat,
      Opportunity,
      Application,
    ].map((m) => m.collection.deleteMany({})),
  );
});

const DAY = 86_400_000;
const oid = () => new mongoose.Types.ObjectId();
const ago = (d: number) => new Date(Date.now() - d * DAY);

/** Raw inserts: these tests care about counting, not about every required field of a real document. */
const raw = (
  m: { collection: { insertMany: (d: object[]) => Promise<unknown> } },
  docs: object[],
) => m.collection.insertMany(docs);

describe("admin analytics", () => {
  it("is admin-only", async () => {
    const { agent } = await registerAgent();
    expect((await agent.get("/api/v1/admin/analytics")).status).toBe(403);
  });

  it("returns zeros, not errors, on an empty system", async () => {
    const admin = await adminAgent();
    const { body } = await admin.get("/api/v1/admin/analytics");
    expect(body.analytics.users).toMatchObject({ students: 0, admins: 1, activeStudents: 0 });
    expect(body.analytics.domains).toHaveLength(12);
    expect(body.analytics.domains[0]).toMatchObject({
      scored: 0,
      avgReadiness: null,
      pctAtOrAboveTarget: null,
    });
    expect(body.analytics.assessments).toEqual([]);
    expect(body.analytics.applications.total).toBe(0);
  });

  it("aggregates readiness, usage, assessments and the application funnel", async () => {
    const admin = await adminAgent();
    const [a, b, c] = [oid(), oid(), oid()];
    await raw(User, [
      {
        _id: a,
        name: "A",
        email: "a@x.io",
        passwordHash: "x",
        role: "student",
        createdAt: ago(60),
      },
      { _id: b, name: "B", email: "b@x.io", passwordHash: "x", role: "student", createdAt: ago(2) },
      { _id: c, name: "C", email: "c@x.io", passwordHash: "x", role: "student", createdAt: ago(2) },
    ]);
    await raw(StudentProfile, [
      { userId: a, activeDomain: "software" },
      { userId: b, activeDomain: "software" },
      { userId: c, activeDomain: "banking" },
    ]);
    const snap = (
      userId: unknown,
      domain: string,
      score: number,
      target: number,
      age: number,
      isFallback = false,
    ) => ({
      userId,
      domain,
      score,
      target,
      isFallback,
      createdAt: ago(age),
    });
    await raw(ReadinessSnapshot, [
      snap(a, "software", 50, 70, 20), // superseded by the newer one below
      snap(a, "software", 80, 70, 1),
      snap(b, "software", 40, 70, 3, true),
      snap(c, "banking", 90, 65, 2),
    ]);

    const assessmentId = oid();
    await raw(Assessment, [
      { _id: assessmentId, title: "Banking basics", domain: "banking", status: "published" },
    ]);
    await raw(AssessmentAttempt, [
      {
        userId: c,
        assessmentId,
        domain: "banking",
        status: "submitted",
        score: 80,
        createdAt: ago(1),
      },
      {
        userId: b,
        assessmentId,
        domain: "banking",
        status: "submitted",
        score: 60,
        createdAt: ago(40),
      },
      { userId: a, assessmentId, domain: "banking", status: "in-progress", createdAt: ago(1) }, // abandoned: not usage
    ]);
    await raw(MentorChat, [{ userId: a, domain: "software", createdAt: ago(5) }]);

    const opp = oid();
    await raw(Opportunity, [
      { _id: opp, domain: "software", type: "job", title: "T", isActive: true },
    ]);
    await raw(Application, [
      { userId: a, opportunityId: opp, status: "applied", createdAt: ago(1) },
      { userId: b, opportunityId: opp, status: "saved", createdAt: ago(1) },
    ]);

    const { body } = await admin.get("/api/v1/admin/analytics");
    const an = body.analytics;

    expect(an.users).toEqual({ students: 3, admins: 1, newStudents: 2, activeStudents: 3 });

    const sw = an.domains.find((d: { slug: string }) => d.slug === "software");
    expect(sw).toMatchObject({
      students: 2,
      scored: 2,
      avgReadiness: 60,
      atOrAboveTarget: 1,
      pctAtOrAboveTarget: 50,
    });
    const bank = an.domains.find((d: { slug: string }) => d.slug === "banking");
    expect(bank).toMatchObject({
      students: 1,
      scored: 1,
      avgReadiness: 90,
      pctAtOrAboveTarget: 100,
    });
    expect(an.readiness).toEqual({ scored: 3, fallbackScores: 1 });

    const mod = (k: string) => an.modules.find((m: { key: string }) => m.key === k);
    expect(mod("assessments")).toMatchObject({ total: 2, users: 2, recent: 1, recentUsers: 1 });
    expect(mod("mentor")).toMatchObject({ total: 1, recent: 1 });
    expect(mod("readiness")).toMatchObject({ total: 4, users: 3, recent: 4, recentUsers: 3 }); // the 20-day-old one is inside 30 days too

    expect(an.assessments).toEqual([
      {
        id: String(assessmentId),
        title: "Banking basics",
        domain: "banking",
        attempts: 2,
        avgScore: 70,
      },
    ]);
    expect(an.applications).toEqual({
      total: 2,
      byStatus: { saved: 1, applied: 1, shortlisted: 0, rejected: 0, offered: 0 },
    });
    expect(an.opportunities).toEqual({ total: 1, active: 1, missingVectors: 1 });
  });

  it("never exposes names or emails, and the window is adjustable", async () => {
    const admin = await adminAgent();
    const res = await admin.get("/api/v1/admin/analytics?days=7");
    expect(res.body.analytics.windowDays).toBe(7);
    expect(JSON.stringify(res.body)).not.toMatch(/@x\.io|passwordHash/);
    expect((await admin.get("/api/v1/admin/analytics?days=99999")).body.analytics.windowDays).toBe(
      30,
    );
  });
});
