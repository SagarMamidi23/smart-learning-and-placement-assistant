import request from "supertest";
import { adminAgent, app, registerAgent, sampleDomain, setupDb, teardownDb } from "../test/helpers";
import { seedDomains } from "../domains/seed";

beforeAll(async () => {
  await setupDb();
  await seedDomains();
});
afterAll(teardownDb);

describe("public domain endpoints", () => {
  it("lists the 12 active domains, sorted by name, without needing to sign in", async () => {
    const res = await request(app).get("/api/v1/domains");
    expect(res.status).toBe(200);
    const names = res.body.domains.map((d: { name: string }) => d.name);
    expect(names).toHaveLength(12);
    expect(names).toEqual([...names].sort());
    expect(res.body.domains[0]).not.toHaveProperty("benchmarkSkills");
  });

  it("returns the full config for one domain", async () => {
    const res = await request(app).get("/api/v1/domains/civil");
    expect(res.status).toBe(200);
    expect(res.body.domain.benchmarkSkills.length).toBeGreaterThan(10);
    expect(res.body.domain.mockEvaluation.rubric.length).toBeGreaterThanOrEqual(2);
    expect(res.body.domain._id).toBeUndefined();
  });

  it("includes the safety notice for healthcare and law", async () => {
    for (const slug of ["healthcare", "law"]) {
      const res = await request(app).get(`/api/v1/domains/${slug}`);
      expect(res.body.domain.safetyNotice).toMatch(/Exam and career preparation only/);
    }
    const res = await request(app).get("/api/v1/domains/software");
    expect(res.body.domain.safetyNotice).toBeUndefined();
  });

  it("404s for an unknown domain and 400s for a malformed slug", async () => {
    expect((await request(app).get("/api/v1/domains/nope")).status).toBe(404);
    expect((await request(app).get("/api/v1/domains/BAD_SLUG!")).status).toBe(400);
  });
});

describe("admin domain endpoints", () => {
  it("require authentication and the admin role", async () => {
    expect((await request(app).get("/api/v1/admin/domains")).status).toBe(401);
    const { agent } = await registerAgent();
    const res = await agent.get("/api/v1/admin/domains");
    expect(res.status).toBe(403);
    expect((await agent.post("/api/v1/admin/domains").send(sampleDomain())).status).toBe(403);
  });

  it("creates a brand-new domain with no code change, and it shows up publicly", async () => {
    const admin = await adminAgent();
    const created = await admin.post("/api/v1/admin/domains").send(sampleDomain("data-science"));
    expect(created.status).toBe(201);
    expect(created.body.domain.slug).toBe("data-science");
    expect(created.body.domain.isActive).toBe(true);

    const list = await request(app).get("/api/v1/domains");
    expect(list.body.domains.map((d: { slug: string }) => d.slug)).toContain("data-science");
  });

  it("rejects duplicates with 409", async () => {
    const admin = await adminAgent();
    await admin.post("/api/v1/admin/domains").send(sampleDomain("dup-domain"));
    const again = await admin.post("/api/v1/admin/domains").send(sampleDomain("dup-domain"));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("DOMAIN_EXISTS");
  });

  it("validates the config (rubric weights, duplicate skills, bad slug)", async () => {
    const admin = await adminAgent();
    const badRubric = sampleDomain("bad-rubric");
    badRubric.mockEvaluation.rubric[0].weight = 0.9;
    const r1 = await admin.post("/api/v1/admin/domains").send(badRubric);
    expect(r1.status).toBe(400);
    expect(JSON.stringify(r1.body.error.details)).toContain("Rubric weights must sum to 1");

    const dupSkill = sampleDomain("dup-skill");
    dupSkill.benchmarkSkills.push({ name: "python", level: 3, weight: 0.1 });
    expect((await admin.post("/api/v1/admin/domains").send(dupSkill)).status).toBe(400);

    expect((await admin.post("/api/v1/admin/domains").send(sampleDomain("Bad Slug"))).status).toBe(
      400,
    );
  });

  it("updates a domain and refuses to change its slug", async () => {
    const admin = await adminAgent();
    await admin.post("/api/v1/admin/domains").send(sampleDomain("editable"));
    const { slug: _slug, ...body } = sampleDomain("editable");
    const ok = await admin
      .put("/api/v1/admin/domains/editable")
      .send({ ...body, readinessTarget: 80 });
    expect(ok.status).toBe(200);
    expect(ok.body.domain.readinessTarget).toBe(80);
    expect(ok.body.domain.slug).toBe("editable");

    const rename = await admin
      .put("/api/v1/admin/domains/editable")
      .send({ ...body, slug: "renamed" });
    expect(rename.status).toBe(400);
    expect((await admin.put("/api/v1/admin/domains/missing").send(body)).status).toBe(404);
  });

  it("hides deactivated domains from the public API but not from admins", async () => {
    const admin = await adminAgent();
    await admin.post("/api/v1/admin/domains").send(sampleDomain("hidden-one"));
    const { slug: _slug, ...body } = sampleDomain("hidden-one");
    await admin.put("/api/v1/admin/domains/hidden-one").send({ ...body, isActive: false });

    expect((await request(app).get("/api/v1/domains/hidden-one")).status).toBe(404);
    const pub = await request(app).get("/api/v1/domains");
    expect(pub.body.domains.map((d: { slug: string }) => d.slug)).not.toContain("hidden-one");

    const adminList = await admin.get("/api/v1/admin/domains");
    const found = adminList.body.domains.find((d: { slug: string }) => d.slug === "hidden-one");
    expect(found.isActive).toBe(false);
    expect((await admin.get("/api/v1/admin/domains/hidden-one")).status).toBe(200);
  });

  it("deletes unused domains but refuses when students have it active", async () => {
    const admin = await adminAgent();
    await admin.post("/api/v1/admin/domains").send(sampleDomain("to-delete"));
    expect((await admin.delete("/api/v1/admin/domains/to-delete")).status).toBe(204);
    expect((await admin.delete("/api/v1/admin/domains/to-delete")).status).toBe(404);

    const student = await registerAgent();
    await student.agent.put("/api/v1/profile/domain").send({ slug: "banking" });
    const blocked = await admin.delete("/api/v1/admin/domains/banking");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DOMAIN_IN_USE");
  });
});

describe("choosing an active domain", () => {
  it("sets and switches the student's single active domain", async () => {
    const { agent } = await registerAgent();
    const first = await agent.put("/api/v1/profile/domain").send({ slug: "software" });
    expect(first.status).toBe(200);
    expect(first.body.profile.activeDomain).toBe("software");
    const second = await agent.put("/api/v1/profile/domain").send({ slug: "teaching" });
    expect(second.body.profile.activeDomain).toBe("teaching");
    expect((await agent.get("/api/v1/profile")).body.profile.activeDomain).toBe("teaching");
  });

  it("rejects unknown and inactive domains, and requires auth", async () => {
    const { agent } = await registerAgent();
    expect((await agent.put("/api/v1/profile/domain").send({ slug: "nope" })).status).toBe(404);
    expect((await agent.put("/api/v1/profile/domain").send({})).status).toBe(400);
    expect((await request(app).put("/api/v1/profile/domain").send({ slug: "law" })).status).toBe(
      401,
    );

    const admin = await adminAgent();
    await admin.post("/api/v1/admin/domains").send(sampleDomain("closed"));
    const { slug: _slug, ...body } = sampleDomain("closed");
    await admin.put("/api/v1/admin/domains/closed").send({ ...body, isActive: false });
    expect((await agent.put("/api/v1/profile/domain").send({ slug: "closed" })).status).toBe(404);
  });
});
