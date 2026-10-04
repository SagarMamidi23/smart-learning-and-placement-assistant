import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { app, registerAgent, sampleResumePdf, setupDb, teardownDb } from "../test/helpers";
import { config } from "../config";

beforeAll(setupDb);
afterAll(async () => {
  await teardownDb();
  await fs.promises.rm(config.uploadDir, { recursive: true, force: true });
});

describe("profile", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/profile")).status).toBe(401);
  });

  it("returns an empty profile after registration", async () => {
    const { agent } = await registerAgent();
    const res = await agent.get("/api/v1/profile");
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      skills: [],
      interests: [],
      hasResume: false,
      activeDomain: null,
    });
  });

  it("updates education, skills and interests, and de-duplicates tags", async () => {
    const { agent } = await registerAgent();
    const res = await agent.put("/api/v1/profile").send({
      education: [{ degree: "B.E.", institution: "Anna University", endYear: 2024 }],
      skills: ["Python", "SQL", "Python"],
      interests: ["AI"],
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.skills).toEqual(["Python", "SQL"]);
    expect(res.body.profile.education[0].institution).toBe("Anna University");
    const again = await agent.get("/api/v1/profile");
    expect(again.body.profile.interests).toEqual(["AI"]);
  });

  it("rejects invalid input and refuses to set activeDomain or resume fields directly", async () => {
    const { agent } = await registerAgent();
    const bad = await agent.put("/api/v1/profile").send({ skills: [""] });
    expect(bad.status).toBe(400);
    const sneaky = await agent
      .put("/api/v1/profile")
      .send({ activeDomain: "law", resumeText: "x" });
    expect(sneaky.status).toBe(400);
  });

  it("keeps profiles separate per user", async () => {
    const a = await registerAgent();
    const b = await registerAgent();
    await a.agent.put("/api/v1/profile").send({ skills: ["Welding"] });
    const res = await b.agent.get("/api/v1/profile");
    expect(res.body.profile.skills).toEqual([]);
  });
});

describe("resume upload", () => {
  it("extracts text from a PDF, stores it, and serves it back to the owner only", async () => {
    const { agent } = await registerAgent();
    const pdf = sampleResumePdf();
    const res = await agent.post("/api/v1/profile/resume").attach("resume", pdf, "cv.pdf");
    expect(res.status).toBe(200);
    expect(res.body.profile.hasResume).toBe(true);
    expect(res.body.profile.resumeTextPreview).toContain("Python and Kubernetes");
    expect(fs.existsSync(path.join(config.uploadDir, "resumes"))).toBe(true);

    const file = await agent.get("/api/v1/profile/resume/file");
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");

    const anon = await request(app).get("/api/v1/profile/resume/file");
    expect(anon.status).toBe(401);
    const other = await registerAgent();
    expect((await other.agent.get("/api/v1/profile/resume/file")).status).toBe(404);
  });

  it("rejects non-PDF content even with a PDF filename and mimetype", async () => {
    const { agent } = await registerAgent();
    const res = await agent
      .post("/api/v1/profile/resume")
      .attach("resume", Buffer.from("<html>not a pdf</html>"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("NOT_A_PDF");
  });

  it("rejects a request with no file", async () => {
    const { agent } = await registerAgent();
    const res = await agent.post("/api/v1/profile/resume").field("x", "y");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_FILE");
  });

  it("rejects a corrupt PDF with 422", async () => {
    const { agent } = await registerAgent();
    const res = await agent
      .post("/api/v1/profile/resume")
      .attach("resume", Buffer.from("%PDF-1.4 garbage garbage"), "cv.pdf");
    expect(res.status).toBe(422);
  });

  it("deletes the resume", async () => {
    const { agent } = await registerAgent();
    await agent.post("/api/v1/profile/resume").attach("resume", sampleResumePdf(), "cv.pdf");
    const del = await agent.delete("/api/v1/profile/resume");
    expect(del.status).toBe(200);
    expect(del.body.profile.hasResume).toBe(false);
    expect((await agent.get("/api/v1/profile/resume/file")).status).toBe(404);
  });
});
