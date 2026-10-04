import { setEmbedder, type Embedder } from "../ai/embeddings";
import { setLLM } from "../ai/llm";
import { seedDomains } from "../domains/seed";
import { Application } from "../models/Application";
import { MatchReason } from "../models/MatchReason";
import { Opportunity } from "../models/Opportunity";
import { FakeEmbedder } from "../test/fakeEmbedder";
import { fakeLLM } from "../test/fakeLLM";
import { adminAgent, registerAgent, setupDb, teardownDb } from "../test/helpers";

beforeAll(async () => {
  await setupDb();
  await seedDomains();
  setEmbedder(new FakeEmbedder());
});
afterAll(async () => {
  setEmbedder(undefined);
  await teardownDb();
});
beforeEach(async () => {
  await Opportunity.deleteMany({});
  await Application.deleteMany({});
  await MatchReason.deleteMany({});
});
afterEach(() => setLLM(undefined));

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

const opp = (over: Record<string, unknown> = {}) => ({
  domain: "software",
  type: "job",
  title: "Backend Engineer",
  organisation: "Acme Systems",
  eligibility: "B.Tech in any branch",
  deadline: null,
  link: "https://example.com/jobs/backend",
  description:
    "Build and operate Python and Kubernetes services, write SQL, and review code with a small platform team.",
  ...over,
});

const reasonsReply = (req: { messages: { role: string; content: string }[] }) => {
  const ids = [...req.messages[1].content.matchAll(/^- id: (\w+)/gm)].map((m) => m[1]);
  return JSON.stringify({
    matches: ids.map((id) => ({
      id,
      reason: "Your Python and SQL skills line up with what this role asks for.",
      caution: "Verify the age limit on the official notification.",
    })),
  });
};

async function student(domain = "software", profile: Record<string, unknown> = {}) {
  const { agent } = await registerAgent();
  await agent.put("/api/v1/profile/domain").send({ slug: domain });
  await agent.put("/api/v1/profile").send({ skills: ["Python", "SQL", "Kubernetes"], ...profile });
  return agent;
}

describe("admin CRUD", () => {
  it("creates, updates, lists and deletes, embedding on write", async () => {
    const admin = await adminAgent();
    const created = await admin.post("/api/v1/admin/opportunities").send(opp());
    expect(created.status).toBe(201);
    const id = created.body.opportunity.id;
    expect(created.body.opportunity).not.toHaveProperty("embedding");
    const stored = await Opportunity.findById(id).select("+embedding");
    expect(stored!.embedding).toHaveLength(256);
    expect(stored!.embeddingModel).toBe("fake-bow-256");

    const upd = await admin
      .put(`/api/v1/admin/opportunities/${id}`)
      .send({ ...opp(), title: "Senior Backend Engineer", domain: undefined });
    expect(upd.status).toBe(200);
    expect(upd.body.opportunity.title).toBe("Senior Backend Engineer");

    expect(
      (await admin.get("/api/v1/admin/opportunities?domain=software")).body.opportunities,
    ).toHaveLength(1);
    expect((await admin.delete(`/api/v1/admin/opportunities/${id}`)).status).toBe(204);
    expect(await Opportunity.countDocuments()).toBe(0);
  });

  it("rejects non-https links, bad dates and types the domain does not offer", async () => {
    const admin = await adminAgent();
    const post = (b: object) => admin.post("/api/v1/admin/opportunities").send(b);
    expect((await post(opp({ link: "javascript:alert(1)" }))).status).toBe(400);
    expect((await post(opp({ link: "http://example.com" }))).status).toBe(400);
    expect((await post(opp({ deadline: "31-12-2026" }))).status).toBe(400);
    const t = await post(opp({ domain: "banking", type: "fellowship" }));
    expect(t.status).toBe(400);
    expect(t.body.error.code).toBe("TYPE_NOT_SUPPORTED");
    expect((await post(opp({ domain: "nope" }))).status).toBe(404);
  });

  it("is admin-only", async () => {
    const { agent } = await registerAgent();
    expect((await agent.post("/api/v1/admin/opportunities").send(opp())).status).toBe(403);
    expect((await agent.get("/api/v1/admin/opportunities")).status).toBe(403);
  });

  it("still saves when the embedding service is down, and reembed fills the gap", async () => {
    const down: Embedder = {
      model: "down",
      embed: async () => {
        throw new Error("ML down");
      },
    };
    setEmbedder(down);
    const admin = await adminAgent();
    const r = await admin.post("/api/v1/admin/opportunities").send(opp());
    expect(r.status).toBe(201);
    const id = r.body.opportunity.id;
    expect((await Opportunity.findById(id).select("+embedding"))!.embedding).toHaveLength(0);

    setEmbedder(new FakeEmbedder());
    const re = await admin.post("/api/v1/admin/opportunities/reembed");
    expect(re.body).toEqual({ checked: 1, embedded: 1 });
    expect((await Opportunity.findById(id).select("+embedding"))!.embedding).toHaveLength(256);
  });

  it("deleting an opportunity removes students' applications to it", async () => {
    const admin = await adminAgent();
    const id = (await admin.post("/api/v1/admin/opportunities").send(opp())).body.opportunity.id;
    const s = await student();
    await s.post("/api/v1/applications").send({ opportunityId: id });
    await admin.delete(`/api/v1/admin/opportunities/${id}`);
    expect(await Application.countDocuments()).toBe(0);
  });
});

describe("browsing", () => {
  it("shows the student's domain, hides inactive and expired, filters by type and text", async () => {
    const admin = await adminAgent();
    const make = (o: object) => admin.post("/api/v1/admin/opportunities").send(o);
    await make(opp({ title: "Open job", deadline: inDays(30) }));
    await make(opp({ title: "Undated internship", type: "internship" }));
    await make(opp({ title: "Expired job", deadline: inDays(-3) }));
    await make(opp({ title: "Paused job", isActive: false }));
    await make(opp({ title: "Banking exam", domain: "banking", type: "exam" }));

    const s = await student();
    const all = await s.get("/api/v1/opportunities");
    expect(all.body.opportunities.map((o: { title: string }) => o.title)).toEqual([
      "Open job",
      "Undated internship",
    ]);
    expect(all.body.opportunities[0].daysLeft).toBe(30);
    expect(all.body.opportunities[1].daysLeft).toBeNull();

    expect((await s.get("/api/v1/opportunities?type=internship")).body.opportunities).toHaveLength(
      1,
    );
    expect((await s.get("/api/v1/opportunities?q=undated")).body.opportunities).toHaveLength(1);
    expect(
      (await s.get("/api/v1/opportunities?includeExpired=true")).body.opportunities,
    ).toHaveLength(3);
    expect((await s.get("/api/v1/opportunities?type=bogus")).status).toBe(400);
    expect((await s.get("/api/v1/opportunities?q=(.*")).status).toBe(200); // regex characters are escaped
    expect((await s.get("/api/v1/opportunities?domain=banking")).body.opportunities).toHaveLength(
      1,
    );
  });

  it("needs a chosen domain", async () => {
    const { agent } = await registerAgent();
    expect((await agent.get("/api/v1/opportunities")).status).toBe(409);
  });
});

describe("matching", () => {
  async function setup() {
    const admin = await adminAgent();
    const make = (o: object) => admin.post("/api/v1/admin/opportunities").send(o);
    await make(opp({ title: "Python backend engineer" }));
    await make(
      opp({
        title: "Campus hiring drive",
        organisation: "Mill Corp",
        description:
          "Entry-level recruitment for welding, lathe machining and plant maintenance trainees across factories.",
      }),
    );
    await make(opp({ title: "Expired role", deadline: inDays(-1) }));
    // The fake embedder only sees shared words, so the profile repeats the job's wording to clear the match scale's floor.
    return student("software", {
      interests: ["build and operate Python and Kubernetes services", "write SQL and review code"],
    });
  }

  it("ranks by similarity, explains with the LLM, skips expired ones", async () => {
    const s = await setup();
    const llm = fakeLLM([reasonsReply]);
    setLLM(llm.service);
    const r = await s.get("/api/v1/opportunities/matches");
    expect(r.status).toBe(200);
    const titles = r.body.matches.map(
      (m: { opportunity: { title: string } }) => m.opportunity.title,
    );
    expect(titles).toEqual(["Python backend engineer", "Campus hiring drive"]);
    expect(r.body.matches[0].match).toBeGreaterThan(r.body.matches[1].match);
    expect(r.body.matches[0].reason).toMatch(/Python/);
    expect(r.body.matches[0].caution).toMatch(/official notification/);
    expect(r.body.rankingFallback).toBe(false);
    expect(r.body.reasonsUnavailable).toBe(false);
    expect(r.body.readiness).toBeNull();
  });

  it("fences student data in the prompt and never sends the key points of other users", async () => {
    const s = await setup();
    const llm = fakeLLM([reasonsReply]);
    setLLM(llm.service);
    await s.get("/api/v1/opportunities/matches");
    const user = llm.provider.calls[0].messages[1].content;
    expect(user).toContain("<student_data>");
    expect(user).toContain("Python");
  });

  it("caches explanations: a second request makes no LLM call", async () => {
    const s = await setup();
    const llm = fakeLLM([reasonsReply]);
    setLLM(llm.service);
    await s.get("/api/v1/opportunities/matches");
    const again = await s.get("/api/v1/opportunities/matches");
    expect(llm.provider.calls).toHaveLength(1);
    expect(again.body.matches[0].reason).toMatch(/Python/);
    // A changed profile asks again.
    await s.put("/api/v1/profile").send({ skills: ["Rust", "Go"] });
    const llm2 = fakeLLM([reasonsReply]);
    setLLM(llm2.service);
    await s.get("/api/v1/opportunities/matches");
    expect(llm2.provider.calls).toHaveLength(1);
  });

  it("still returns matches when the LLM fails", async () => {
    const s = await setup();
    setLLM(fakeLLM([new Error("boom"), new Error("boom")]).service);
    const r = await s.get("/api/v1/opportunities/matches");
    expect(r.status).toBe(200);
    expect(r.body.matches).toHaveLength(2);
    expect(r.body.matches[0].reason).toBeNull();
    expect(r.body.reasonsUnavailable).toBe(true);
  });

  it("falls back to keyword ranking when embeddings are down", async () => {
    const s = await setup();
    setEmbedder({
      model: "down",
      embed: async () => {
        throw new Error("ML down");
      },
    });
    setLLM(fakeLLM([reasonsReply]).service);
    const r = await s.get("/api/v1/opportunities/matches");
    expect(r.status).toBe(200);
    expect(r.body.rankingFallback).toBe(true);
    expect(r.body.matches[0].opportunity.title).toBe("Python backend engineer");
    setEmbedder(new FakeEmbedder());
  });

  it("does not ask the LLM to explain a student with an empty profile", async () => {
    const admin = await adminAgent();
    await admin.post("/api/v1/admin/opportunities").send(opp());
    const { agent } = await registerAgent();
    await agent.put("/api/v1/profile/domain").send({ slug: "software" });
    const llm = fakeLLM([]);
    setLLM(llm.service);
    const r = await agent.get("/api/v1/opportunities/matches");
    expect(r.status).toBe(200);
    expect(llm.provider.calls).toHaveLength(0);
    expect(r.body.reasonsUnavailable).toBe(true);
  });

  it("marks matches the student already tracks and reports readiness", async () => {
    const s = await setup();
    setLLM(fakeLLM([reasonsReply]).service);
    const first = (await s.get("/api/v1/opportunities/matches")).body.matches[0];
    await s
      .post("/api/v1/applications")
      .send({ opportunityId: first.opportunity.id, status: "applied" });
    const r = await s.get("/api/v1/opportunities/matches");
    expect(r.body.matches[0].application.status).toBe("applied");
  });

  it("returns an empty list, not an error, when the domain has no opportunities", async () => {
    const s = await student("law");
    const llm = fakeLLM([]);
    setLLM(llm.service);
    const r = await s.get("/api/v1/opportunities/matches");
    expect(r.status).toBe(200);
    expect(r.body.matches).toEqual([]);
    expect(llm.provider.calls).toHaveLength(0);
  });
});

describe("applications", () => {
  async function tracked(over: Record<string, unknown> = {}) {
    const admin = await adminAgent();
    const o = (await admin.post("/api/v1/admin/opportunities").send(opp(over))).body.opportunity;
    const s = await student();
    return { s, o, admin };
  }

  it("tracks an opportunity once, records status history and applied date", async () => {
    const { s, o } = await tracked();
    const created = await s.post("/api/v1/applications").send({ opportunityId: o.id });
    expect(created.status).toBe(201);
    expect(created.body.application.status).toBe("saved");
    expect((await s.post("/api/v1/applications").send({ opportunityId: o.id })).status).toBe(409);

    const id = created.body.application.id;
    const up = await s
      .patch(`/api/v1/applications/${id}`)
      .send({ status: "applied", notes: "Sent CV" });
    expect(up.body.application.status).toBe("applied");
    expect(up.body.application.appliedAt).toBeDefined();
    expect(up.body.application.history.map((h: { status: string }) => h.status)).toEqual([
      "saved",
      "applied",
    ]);
    expect(up.body.application.opportunity.title).toBe("Backend Engineer");

    const list = await s.get("/api/v1/applications");
    expect(list.body.applications).toHaveLength(1);
    expect(list.body.statuses).toContain("shortlisted");
  });

  it("validates updates and ignores unknown fields", async () => {
    const { s, o } = await tracked();
    const id = (await s.post("/api/v1/applications").send({ opportunityId: o.id })).body.application
      .id;
    const patch = (b: object) => s.patch(`/api/v1/applications/${id}`).send(b);
    expect((await patch({ status: "hired" })).status).toBe(400);
    expect((await patch({ userId: "x" })).status).toBe(400);
    expect((await patch({ deadlines: [{ label: "x", date: "tomorrow" }] })).status).toBe(400);
    expect((await s.post("/api/v1/applications").send({ opportunityId: "zzz" })).status).toBe(400);
    expect(
      (await s.post("/api/v1/applications").send({ opportunityId: "a".repeat(24) })).status,
    ).toBe(404);
  });

  it("keeps applications private to their owner", async () => {
    const { s, o } = await tracked();
    const id = (await s.post("/api/v1/applications").send({ opportunityId: o.id })).body.application
      .id;
    const { agent: other } = await registerAgent();
    expect(
      (await other.patch(`/api/v1/applications/${id}`).send({ notes: "mine now" })).status,
    ).toBe(404);
    expect((await other.delete(`/api/v1/applications/${id}`)).status).toBe(404);
    expect((await other.get("/api/v1/applications")).body.applications).toEqual([]);
    expect((await s.delete(`/api/v1/applications/${id}`)).status).toBe(204);
  });

  it("raises alerts for deadlines, custom reminders and overdue saves, and stays quiet for closed ones", async () => {
    const admin = await adminAgent();
    const make = async (title: string, deadline: string | null) =>
      (await admin.post("/api/v1/admin/opportunities").send(opp({ title, deadline }))).body
        .opportunity;
    const soon = await make("Soon", inDays(5));
    const far = await make("Far", inDays(60));
    const gone = await make("Gone", inDays(-2));
    const applied = await make("Applied already", inDays(3));
    const rejected = await make("Rejected", inDays(2));

    const s = await student();
    const track = async (id: string, status = "saved") =>
      (await s.post("/api/v1/applications").send({ opportunityId: id, status })).body.application
        .id;
    await track(soon.id);
    const farApp = await track(far.id);
    await track(gone.id);
    await track(applied.id, "applied");
    await track(rejected.id, "rejected");
    await s.patch(`/api/v1/applications/${farApp}`).send({
      deadlines: [
        { label: "Admit card", date: inDays(1) },
        { label: "Too far", date: inDays(40) },
        { label: "Past", date: inDays(-1) },
      ],
    });

    const { alerts } = (await s.get("/api/v1/applications/alerts")).body;
    expect(
      alerts.map(
        (a: { kind: string; opportunityTitle: string }) => `${a.kind}:${a.opportunityTitle}`,
      ),
    ).toEqual(["overdue:Gone", "custom:Far", "deadline:Soon"]);
    expect(alerts[0].daysLeft).toBe(-2);
    expect(alerts[1]).toMatchObject({ message: "Admit card", daysLeft: 1 });
    expect(alerts[2]).toMatchObject({ daysLeft: 5 });
  });
});
