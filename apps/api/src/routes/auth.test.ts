import request from "supertest";
import { app, registerAgent, setupDb, teardownDb } from "../test/helpers";
import { User } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import { StudentProfile } from "../models/StudentProfile";

beforeAll(setupDb);
afterAll(teardownDb);

const cookiesOf = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[]) ?? [];

describe("POST /auth/register", () => {
  it("creates a student, a profile, and sets httpOnly cookies", async () => {
    const { res, email } = await registerAgent();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, role: "student" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookies = cookiesOf(res);
    expect(cookies.some((c) => c.startsWith("slp_access=") && c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("slp_refresh=") && c.includes("HttpOnly"))).toBe(true);
    const user = await User.findOne({ email });
    expect(user!.passwordHash).not.toContain("Passw0rdOK");
    expect(await StudentProfile.countDocuments({ userId: user!._id })).toBe(1);
  });

  it("ignores a client-supplied role", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Sneaky", email: "sneaky@example.com", password: "Passw0rdOK", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("student");
  });

  it("rejects duplicate emails (case-insensitive) with 409", async () => {
    await registerAgent("dup@example.com");
    const { res } = await registerAgent("DUP@example.com");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects weak passwords and bad emails with 400", async () => {
    const weak = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Weak", email: "weak@example.com", password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");
    const bad = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Bad", email: "not-an-email", password: "Passw0rdOK" });
    expect(bad.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    const { email } = await registerAgent("login@example.com");
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Passw0rdOK" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it("gives the same 401 for wrong password and unknown email", async () => {
    await registerAgent("known@example.com");
    const wrong = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "known@example.com", password: "WrongPass1" });
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "WrongPass1" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
});

describe("GET /auth/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user via cookie", async () => {
    const { agent, email } = await registerAgent();
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it("rejects a tampered token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer abc.def.ghi");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});

describe("refresh token rotation", () => {
  it("issues a new pair and invalidates the old refresh token", async () => {
    const { agent, res } = await registerAgent();
    const oldRefresh = cookiesOf(res)
      .find((c) => c.startsWith("slp_refresh="))!
      .split(";")[0];

    const refreshed = await agent.post("/api/v1/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(cookiesOf(refreshed).some((c) => c.startsWith("slp_refresh="))).toBe(true);

    // Replaying the old token is treated as theft: rejected, and all sessions are revoked.
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldRefresh);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("TOKEN_REUSED");
    const afterRevoke = await agent.post("/api/v1/auth/refresh");
    expect(afterRevoke.status).toBe(401);
  });

  it("requires a refresh cookie", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears cookies", async () => {
    const { agent, res } = await registerAgent();
    const oldRefresh = cookiesOf(res)
      .find((c) => c.startsWith("slp_refresh="))!
      .split(";")[0];
    const before = await RefreshToken.countDocuments();
    const out = await agent.post("/api/v1/auth/logout");
    expect(out.status).toBe(204);
    expect(await RefreshToken.countDocuments()).toBe(before - 1);
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldRefresh);
    expect(replay.status).toBe(401);
  });
});
