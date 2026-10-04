import express from "express";
import request from "supertest";
import { authenticate, requireRole } from "./auth";
import { errorHandler } from "../errors";
import { signAccessToken } from "../auth/tokens";

const app = express();
app.get("/admin", authenticate, requireRole("admin"), (_req, res) => res.json({ ok: true }));
app.get("/staff", authenticate, requireRole("admin", "mentor"), (_req, res) =>
  res.json({ ok: true }),
);
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) =>
  errorHandler(err, req, res, next),
);

const as = (role: "student" | "mentor" | "admin") => `Bearer ${signAccessToken("u1", role)}`;

describe("requireRole", () => {
  it("401 without a token", async () => {
    expect((await request(app).get("/admin")).status).toBe(401);
  });

  it("403 for the wrong role", async () => {
    const res = await request(app).get("/admin").set("Authorization", as("student"));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("200 for an allowed role", async () => {
    expect((await request(app).get("/admin").set("Authorization", as("admin"))).status).toBe(200);
    expect((await request(app).get("/staff").set("Authorization", as("mentor"))).status).toBe(200);
  });
});
