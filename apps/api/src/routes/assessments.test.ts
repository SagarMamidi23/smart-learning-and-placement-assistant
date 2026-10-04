import request from "supertest";
import { setEmbedder } from "../ai/embeddings";
import { LLMService, setLLM } from "../ai/llm";
import { LLMProviderError } from "../ai/llm/types";
import { invalidateDomain } from "../ai/rag/retrieve";
import { seedDomains } from "../domains/seed";
import { Assessment } from "../models/Assessment";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { StudyChunk, StudyMaterial } from "../models/StudyMaterial";
import { FakeEmbedder, fixturePdf } from "../test/fakeEmbedder";
import { fakeLLM, lastPrompt } from "../test/fakeLLM";
import { adminAgent, app, registerAgent, setupDb, teardownDb } from "../test/helpers";

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
  await Assessment.deleteMany({});
  await AssessmentAttempt.deleteMany({});
  await StudyChunk.deleteMany({});
  await StudyMaterial.deleteMany({});
  invalidateDomain();
});
afterEach(() => setLLM(undefined));

type Req = { messages: { role: string; content: string }[] };
const use = (replies: Parameters<typeof fakeLLM>[0]) => {
  const f = fakeLLM(replies);
  setLLM(f.service);
  return f;
};

/** Generation reply that follows whatever counts the prompt asked for. The correct option is always first. */
const genReply = (req: Req) => {
  const m = /exactly (\d+) multiple-choice question\(s\) and exactly (\d+) practical/.exec(
    req.messages[0].content,
  )!;
  const [mcq, practical] = [Number(m[1]), Number(m[2])];
  const skill = /^- (.+) \(\d\)$/m.exec(req.messages[1].content)![1];
  const questions = [
    ...Array.from({ length: mcq }, (_, i) => ({
      kind: "mcq",
      prompt: `Multiple choice question number ${i + 1} about the topic`,
      options: [`Correct answer ${i + 1}`, `Wrong a${i}`, `Wrong b${i}`, `Wrong c${i}`],
      correctIndex: 0,
      explanation: `Option ${i + 1} is right because of the rule.`,
      skill,
      difficulty: 2,
    })),
    ...Array.from({ length: practical }, (_, i) => ({
      kind: "practical",
      prompt: `Practical task number ${i + 1}: explain the process in your own words`,
      modelAnswer: "Key points: define the term, apply the rule, state the conclusion.",
      maxMarks: 4,
      skill,
      difficulty: 2,
    })),
  ];
  return JSON.stringify({ title: "Core concepts check", questions });
};

const gradeReply = (marks: Record<string, number> | number) => (req: Req) => {
  const items = [...req.messages[1].content.matchAll(/QUESTION (\S+) \(max (\d+) marks\)/g)];
  return JSON.stringify({
    results: items.map((m) => ({
      questionId: m[1],
      awarded: typeof marks === "number" ? marks : (marks[m[1]] ?? 0),
      feedback: "Covers some of the key points but misses the conclusion.",
    })),
  });
};

async function draft(
  admin: ReturnType<typeof request.agent>,
  domain = "software",
  body: Record<string, unknown> = {},
) {
  use([genReply]);
  const res = await admin
    .post("/api/v1/admin/assessments/generate")
    .send({ domain, count: 4, ...body });
  expect(res.status).toBe(201);
  return res.body.assessment as {
    id: string;
    status: string;
    questions: { id: string; kind: string; options?: string[]; correctIndex?: number }[];
  };
}

async function published(domain = "software", body: Record<string, unknown> = {}) {
  const admin = await adminAgent();
  const a = await draft(admin, domain, body);
  expect((await admin.post(`/api/v1/admin/assessments/${a.id}/publish`)).status).toBe(200);
  const { agent } = await registerAgent();
  await agent.put("/api/v1/profile/domain").send({ slug: domain });
  return { admin, agent, a };
}

describe("admin: generating and reviewing drafts", () => {
  it("is admin-only", async () => {
    expect(
      (await request(app).post("/api/v1/admin/assessments/generate").send({ domain: "software" }))
        .status,
    ).toBe(401);
    const { agent } = await registerAgent();
    expect(
      (await agent.post("/api/v1/admin/assessments/generate").send({ domain: "software" })).status,
    ).toBe(403);
    expect((await agent.get("/api/v1/admin/assessments")).status).toBe(403);
  });

  it("creates a draft with valid, shuffled mcqs, and students cannot see it", async () => {
    const admin = await adminAgent();
    const a = await draft(admin);
    expect(a.status).toBe("draft");
    expect(a.questions).toHaveLength(4);
    expect(new Set(a.questions.map((q) => q.id)).size).toBe(4);
    for (const q of a.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.options![q.correctIndex!]).toMatch(/^Correct answer/); // shuffled, key remapped
    }

    const { agent } = await registerAgent();
    await agent.put("/api/v1/profile/domain").send({ slug: "software" });
    expect((await agent.get("/api/v1/assessments")).body.assessments).toEqual([]);
    expect((await agent.post(`/api/v1/assessments/${a.id}/start`)).status).toBe(404);
  });

  it("creates practical questions with a type the domain supports", async () => {
    const admin = await adminAgent();
    const a = await draft(admin, "software", { count: 5, practicalCount: 2 });
    expect(a.questions.filter((q) => q.kind === "practical")).toHaveLength(2);
    const full = await admin.get(`/api/v1/admin/assessments/${a.id}`);
    expect(full.body.assessment.type).toBe("coding"); // software's first non-mcq type
    expect(
      full.body.assessment.questions.find((q: { kind: string }) => q.kind === "practical")
        .modelAnswer,
    ).toContain("Key points");
  });

  it("bases questions on study material when the domain has some, and says so", async () => {
    const admin = await adminAgent();
    await admin
      .post("/api/v1/admin/study-material")
      .field("domain", "mechanical")
      .field("title", "Thermo Notes")
      .field("source", "Notes")
      .field("license", "CC0")
      .attach("file", fixturePdf("thermo.pdf"), "t.pdf");
    // Retrieval for a skill name only matches if the skill is about the material, so ask with a focus.
    const f = use([genReply]);
    const res = await admin
      .post("/api/v1/admin/assessments/generate")
      .send({ domain: "mechanical", count: 3, focus: "entropy second law thermodynamics" });
    expect(res.status).toBe(201);
    expect(res.body.assessment.grounded).toBe(true);
    expect(res.body.assessment.groundedOn).toEqual(["Thermo Notes"]);
    expect(lastPrompt(f.provider)).toContain("<study_material>");
    expect(f.provider.calls[0].messages[0].content).toContain("ONLY on the passages");
  });

  it("is ungrounded when there is no material", async () => {
    const admin = await adminAgent();
    const f = use([genReply]);
    const res = await admin
      .post("/api/v1/admin/assessments/generate")
      .send({ domain: "software", count: 3 });
    expect(res.body.assessment.grounded).toBe(false);
    expect(lastPrompt(f.provider)).not.toContain("<study_material>");
  });

  it("asks the model again when it returns the wrong mix", async () => {
    const admin = await adminAgent();
    const f = use([
      (req: Req) => {
        const parsed = JSON.parse(genReply(req));
        parsed.questions.pop(); // one short
        return JSON.stringify(parsed);
      },
      genReply,
    ]);
    const res = await admin
      .post("/api/v1/admin/assessments/generate")
      .send({ domain: "software", count: 4 });
    expect(res.status).toBe(201);
    expect(f.provider.calls).toHaveLength(2);
  });

  it("validates the request, the domain and the type", async () => {
    const admin = await adminAgent();
    use([]);
    const post = (b: object) => admin.post("/api/v1/admin/assessments/generate").send(b);
    expect((await post({ domain: "software", count: 3, practicalCount: 3 })).status).toBe(400);
    expect((await post({ domain: "software", count: 99 })).status).toBe(400);
    expect((await post({ domain: "nope" })).status).toBe(404);
    expect((await post({ domain: "software", type: "demo-lesson" })).body.error.code).toBe(
      "TYPE_NOT_SUPPORTED",
    );
  });

  it("returns 503 cleanly when the LLM is not configured", async () => {
    setLLM(new LLMService(null));
    const admin = await adminAgent();
    const res = await admin.post("/api/v1/admin/assessments/generate").send({ domain: "software" });
    expect(res.status).toBe(503);
  });

  it("edits a draft, and refuses invalid edits", async () => {
    const admin = await adminAgent();
    const a = await draft(admin);
    const full = (await admin.get(`/api/v1/admin/assessments/${a.id}`)).body.assessment;
    const edited = {
      title: "Reviewed title",
      type: full.type,
      timeLimitMinutes: 15,
      questions: full.questions.slice(0, 3),
    };
    const ok = await admin.put(`/api/v1/admin/assessments/${a.id}`).send(edited);
    expect(ok.status).toBe(200);
    expect(ok.body.assessment).toMatchObject({
      title: "Reviewed title",
      timeLimitMinutes: 15,
      questionCount: 3,
    });

    const dupOptions = structuredClone(edited);
    dupOptions.questions[0].options = ["same", "same", "x", "y"];
    expect((await admin.put(`/api/v1/admin/assessments/${a.id}`).send(dupOptions)).status).toBe(
      400,
    );
    const badKey = structuredClone(edited);
    badKey.questions[0].correctIndex = 7;
    expect((await admin.put(`/api/v1/admin/assessments/${a.id}`).send(badKey)).status).toBe(400);
  });

  it("publishes only valid drafts with enough questions, and published ones are locked", async () => {
    const admin = await adminAgent();
    const a = await draft(admin);
    const full = (await admin.get(`/api/v1/admin/assessments/${a.id}`)).body.assessment;
    await admin
      .put(`/api/v1/admin/assessments/${a.id}`)
      .send({ title: full.title, type: full.type, questions: full.questions.slice(0, 2) });
    const tooFew = await admin.post(`/api/v1/admin/assessments/${a.id}/publish`);
    expect([tooFew.status, tooFew.body.error.code]).toEqual([400, "TOO_FEW_QUESTIONS"]);

    await admin
      .put(`/api/v1/admin/assessments/${a.id}`)
      .send({ title: full.title, type: full.type, questions: full.questions });
    const pub = await admin.post(`/api/v1/admin/assessments/${a.id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.assessment).toMatchObject({ status: "published", reviewed: true });
    expect((await admin.post(`/api/v1/admin/assessments/${a.id}/publish`)).status).toBe(409);
    const edit = await admin
      .put(`/api/v1/admin/assessments/${a.id}`)
      .send({ title: "x y z", type: full.type, questions: full.questions });
    expect([edit.status, edit.body.error.code]).toEqual([409, "ASSESSMENT_PUBLISHED"]);
  });

  it("unpublishes, duplicates and deletes unless students have attempted it", async () => {
    const { admin, agent, a } = await published();
    const copy = await admin.post(`/api/v1/admin/assessments/${a.id}/duplicate`);
    expect(copy.body.assessment).toMatchObject({ status: "draft", questionCount: 4 });
    expect(copy.body.assessment.title).toContain("(copy)");

    expect(
      (await admin.post(`/api/v1/admin/assessments/${a.id}/unpublish`)).body.assessment.status,
    ).toBe("draft");
    await admin.post(`/api/v1/admin/assessments/${a.id}/publish`);
    await agent.post(`/api/v1/assessments/${a.id}/start`);
    const blocked = await admin.post(`/api/v1/admin/assessments/${a.id}/unpublish`);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "HAS_ATTEMPTS"]);
    expect((await admin.delete(`/api/v1/admin/assessments/${a.id}`)).status).toBe(409);
    expect(
      (await admin.delete(`/api/v1/admin/assessments/${copy.body.assessment.id}`)).status,
    ).toBe(204);
  });

  it("lists by domain and status", async () => {
    const admin = await adminAgent();
    await draft(admin, "software");
    const m = await draft(admin, "civil");
    await admin.post(`/api/v1/admin/assessments/${m.id}/publish`);
    const list = (q: string) =>
      admin.get(`/api/v1/admin/assessments${q}`).then((r) => r.body.assessments);
    expect(await list("")).toHaveLength(2);
    expect(await list("?domain=civil")).toHaveLength(1);
    expect((await list("?status=published"))[0].domain).toBe("civil");
  });
});

describe("students: taking assessments", () => {
  it("shows published assessments for the student's own domain only, without answer keys", async () => {
    const { agent, a } = await published("software");
    const list = await agent.get("/api/v1/assessments");
    expect(list.body.assessments).toHaveLength(1);
    expect(list.body.assessments[0]).toMatchObject({ id: a.id, questionCount: 4, attempts: 0 });

    const start = await agent.post(`/api/v1/assessments/${a.id}/start`);
    expect(start.status).toBe(201);
    const text = JSON.stringify(start.body);
    expect(text).not.toMatch(/correctIndex|modelAnswer|explanation/);
    expect(start.body.attempt.questions[0].options).toHaveLength(4);

    const other = await registerAgent();
    await other.agent.put("/api/v1/profile/domain").send({ slug: "civil" });
    expect((await other.agent.get("/api/v1/assessments")).body.assessments).toEqual([]);
    expect((await other.agent.post(`/api/v1/assessments/${a.id}/start`)).status).toBe(404);
  });

  it("needs sign-in and a domain", async () => {
    expect((await request(app).get("/api/v1/assessments")).status).toBe(401);
    const { agent } = await registerAgent();
    expect((await agent.get("/api/v1/assessments")).body.error.code).toBe("NO_ACTIVE_DOMAIN");
  });

  it("resumes an unfinished attempt instead of starting a second one", async () => {
    const { agent, a } = await published();
    const first = await agent.post(`/api/v1/assessments/${a.id}/start`);
    const again = await agent.post(`/api/v1/assessments/${a.id}/start`);
    expect(again.status).toBe(200);
    expect(again.body.attempt.id).toBe(first.body.attempt.id);
    expect(await AssessmentAttempt.countDocuments({})).toBe(1);
  });

  it("auto-grades mcqs, reveals the key afterwards, and records the time taken", async () => {
    const { agent, a } = await published();
    const start = await agent.post(`/api/v1/assessments/${a.id}/start`);
    const attempt = start.body.attempt;
    const full = await Assessment.findById(a.id);
    const keys = new Map(full!.questions.map((q) => [q.id, q.correctIndex]));

    // Right, right, wrong, unanswered -> 2 of 4.
    const [q1, q2, q3] = attempt.questions;
    const wrong = (keys.get(q3.id)! + 1) % 4;
    const res = await agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send({
      answers: [
        { questionId: q1.id, selected: keys.get(q1.id) },
        { questionId: q2.id, selected: keys.get(q2.id) },
        { questionId: q3.id, selected: wrong },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.attempt).toMatchObject({ status: "submitted", score: 50 });
    expect(res.body.attempt.timeTakenSec).toBeGreaterThanOrEqual(0);
    const r = res.body.attempt.results;
    expect(r.map((x: { awarded: number }) => x.awarded)).toEqual([1, 1, 0, 0]);
    expect(r[2]).toMatchObject({ correct: false, selected: wrong, correctIndex: keys.get(q3.id) });
    expect(r[2].explanation).toContain("right because");

    // Once submitted it cannot be resubmitted, and the stored result survives a reload.
    expect(
      (await agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send({ answers: [] }))
        .status,
    ).toBe(409);
    const reload = await agent.get(`/api/v1/assessments/attempts/${attempt.id}`);
    expect(reload.body.attempt.score).toBe(50);
    expect(reload.body.attempt.results[2].correctIndex).toBe(keys.get(q3.id));
  });

  it("tracks best score and history", async () => {
    const { agent, a } = await published();
    const full = await Assessment.findById(a.id);
    const allRight = (qs: { id: string }[]) =>
      qs.map((q) => ({
        questionId: q.id,
        selected: full!.questions.find((x) => x.id === q.id)!.correctIndex,
      }));

    const s1 = (await agent.post(`/api/v1/assessments/${a.id}/start`)).body.attempt;
    await agent.post(`/api/v1/assessments/attempts/${s1.id}/submit`).send({ answers: [] }); // 0
    const s2 = (await agent.post(`/api/v1/assessments/${a.id}/start`)).body.attempt;
    expect(s2.id).not.toBe(s1.id);
    await agent
      .post(`/api/v1/assessments/attempts/${s2.id}/submit`)
      .send({ answers: allRight(s2.questions) }); // 100

    const list = (await agent.get("/api/v1/assessments")).body.assessments[0];
    expect(list).toMatchObject({ bestScore: 100, attempts: 2 });
    const history = (await agent.get("/api/v1/assessments/attempts")).body.attempts;
    expect(history.map((h: { score: number }) => h.score).sort()).toEqual([0, 100]);
    expect(history[0].title).toBe("Core concepts check");
  });

  it("validates submissions and protects other students' attempts", async () => {
    const { agent, a } = await published();
    const attempt = (await agent.post(`/api/v1/assessments/${a.id}/start`)).body.attempt;
    const submit = (b: object) =>
      agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send(b);
    expect((await submit({ answers: [{ questionId: "nope", selected: 1 }] })).body.error.code).toBe(
      "UNKNOWN_QUESTION",
    );
    expect(
      (await submit({ answers: [{ questionId: attempt.questions[0].id, selected: 9 }] })).status,
    ).toBe(400);
    expect((await submit({})).status).toBe(400);

    const other = await registerAgent();
    expect((await other.agent.get(`/api/v1/assessments/attempts/${attempt.id}`)).status).toBe(404);
    expect(
      (
        await other.agent
          .post(`/api/v1/assessments/attempts/${attempt.id}/submit`)
          .send({ answers: [] })
      ).status,
    ).toBe(404);
  });
});

describe("students: practical questions", () => {
  async function withPractical() {
    const { agent, a } = await published("software", { count: 4, practicalCount: 2 });
    const attempt = (await agent.post(`/api/v1/assessments/${a.id}/start`)).body.attempt;
    const practical = attempt.questions.filter((q: { kind: string }) => q.kind === "practical");
    return { agent, a, attempt, practical };
  }

  it("grades written answers with the LLM against the key points", async () => {
    const { agent, attempt, practical } = await withPractical();
    const f = use([gradeReply({ [practical[0].id]: 3, [practical[1].id]: 4 })]);
    const res = await agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send({
      answers: [
        { questionId: practical[0].id, text: "My explanation of the process." },
        { questionId: practical[1].id, text: "Another full explanation." },
      ],
    });
    expect(res.status).toBe(200);
    const results = res.body.attempt.results.filter(
      (r: { kind: string }) => r.kind === "practical",
    );
    expect(results.map((r: { awarded: number }) => r.awarded)).toEqual([3, 4]);
    expect(results[0].modelAnswer).toContain("Key points");
    expect(results[0].feedback).toContain("key points");
    // 7 of 4+4 practical marks, 0 of 2 mcqs unanswered -> 7/10
    expect(res.body.attempt.score).toBe(70);
    // The student's text is fenced as data in the grading prompt.
    expect(lastPrompt(f.provider)).toContain("<student_answer>");
  });

  it("does not send blank answers to the LLM at all", async () => {
    const { agent, attempt } = await withPractical();
    const f = use([]);
    const res = await agent
      .post(`/api/v1/assessments/attempts/${attempt.id}/submit`)
      .send({ answers: [] });
    expect(res.status).toBe(200);
    expect(f.provider.calls).toHaveLength(0);
    expect(res.body.attempt.score).toBe(0);
  });

  it("keeps the attempt open if grading fails, so nothing is lost", async () => {
    const { agent, attempt, practical } = await withPractical();
    use([new LLMProviderError("rate_limited", "429")]);
    const body = { answers: [{ questionId: practical[0].id, text: "A real answer to grade." }] };
    const failed = await agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send(body);
    expect([failed.status, failed.body.error.code]).toEqual([503, "LLM_BUSY"]);
    expect((await AssessmentAttempt.findById(attempt.id))!.status).toBe("in-progress");

    use([gradeReply(2)]);
    const retry = await agent.post(`/api/v1/assessments/attempts/${attempt.id}/submit`).send(body);
    expect(retry.status).toBe(200);
  });

  it("asks the grader again when it awards more than the maximum", async () => {
    const { agent, attempt, practical } = await withPractical();
    const f = use([gradeReply(99), gradeReply(2)]);
    const res = await agent
      .post(`/api/v1/assessments/attempts/${attempt.id}/submit`)
      .send({ answers: [{ questionId: practical[0].id, text: "An answer worth grading." }] });
    expect(res.status).toBe(200);
    expect(f.provider.calls).toHaveLength(2);
    expect(f.provider.calls[1].messages.at(-1)!.content).toContain("exceeds the maximum");
  });
});
