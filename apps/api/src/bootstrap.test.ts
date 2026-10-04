import request from "supertest";
import { setEmbedder } from "./ai/embeddings";
import { bootstrap } from "./bootstrap";
import { config } from "./config";
import { DomainConfig } from "./models/DomainConfig";
import { Opportunity } from "./models/Opportunity";
import { User } from "./models/User";
import { FakeEmbedder } from "./test/fakeEmbedder";
import { app, setupDb, teardownDb } from "./test/helpers";

beforeAll(setupDb);
afterAll(async () => {
  setEmbedder(undefined);
  await teardownDb();
});
beforeEach(async () => {
  setEmbedder(new FakeEmbedder());
  await Promise.all([DomainConfig.deleteMany({}), Opportunity.deleteMany({}), User.deleteMany({})]);
});

describe("bootstrap", () => {
  it("does nothing unless asked", async () => {
    await bootstrap({});
    expect(await DomainConfig.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  it("seeds domains then opportunities with AUTO_SEED, and is safe to repeat", async () => {
    await bootstrap({ autoSeed: true });
    const domains = await DomainConfig.countDocuments();
    const opps = await Opportunity.countDocuments();
    expect(domains).toBe(12);
    expect(opps).toBeGreaterThan(50);
    await bootstrap({ autoSeed: true });
    expect(await DomainConfig.countDocuments()).toBe(domains);
    expect(await Opportunity.countDocuments()).toBe(opps);
  });

  it("creates the first admin who can sign in, and ignores the variables once one exists", async () => {
    await bootstrap({ adminEmail: "Boss@Example.com", adminPassword: "Str0ngPassw0rd" });
    const admin = await User.findOne({ role: "admin" });
    expect(admin?.email).toBe("boss@example.com");
    expect(admin?.passwordHash).not.toContain("Str0ngPassw0rd");
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "boss@example.com", password: "Str0ngPassw0rd" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("admin");

    await bootstrap({ adminEmail: "other@example.com", adminPassword: "An0therPassw0rd" });
    expect(await User.countDocuments({ role: "admin" })).toBe(1);
  });

  it("refuses a weak password or a half-set pair, without throwing", async () => {
    await expect(
      bootstrap({ adminEmail: "a@example.com", adminPassword: "short" }),
    ).resolves.toBeUndefined();
    await expect(bootstrap({ adminEmail: "a@example.com" })).resolves.toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
  });
});

describe("/metrics token", () => {
  afterEach(() => {
    config.metricsToken = undefined;
  });

  it("is open by default and locked when METRICS_TOKEN is set", async () => {
    expect((await request(app).get("/metrics")).status).toBe(200);

    config.metricsToken = "a-long-enough-secret-token";
    expect((await request(app).get("/metrics")).status).toBe(401);
    expect(
      (await request(app).get("/metrics").set("Authorization", "Bearer wrong-token-value-here!"))
        .status,
    ).toBe(401);
    const ok = await request(app)
      .get("/metrics")
      .set("Authorization", "Bearer a-long-enough-secret-token");
    expect(ok.status).toBe(200);
    expect(ok.text).toMatch(/http_request_duration_seconds/);
    // Health checks stay open: the host needs them without a secret.
    expect((await request(app).get("/health")).status).toBe(200);
  });
});
