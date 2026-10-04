import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "../models/User";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../app";
import { connectDb } from "../db";
import { config } from "../config";

/** Each test file gets its own database on the shared in-memory server. */
export async function setupDb() {
  await connectDb(config.mongoUri, `test_${randomUUID().replace(/-/g, "")}`);
  await mongoose.syncIndexes();
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export const app = createApp();

export async function registerAgent(email = `u${randomUUID().slice(0, 8)}@example.com`) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/register")
    .send({ name: "Test User", email, password: "Passw0rdOK" });
  return { agent, email, res };
}

/** Signed-in admin (public sign-up can only create students, so the user is inserted directly). */
export async function adminAgent() {
  const email = `admin${randomUUID().slice(0, 8)}@example.com`;
  await User.create({
    name: "Admin",
    email,
    passwordHash: await bcrypt.hash("Passw0rdOK", 4),
    role: "admin",
  });
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password: "Passw0rdOK" });
  return agent;
}

/** A valid domain payload for creating a new domain through the API. */
export const sampleDomain = (slug = "data-science") => ({
  slug,
  name: "Data Science",
  description: "Data science and analytics careers across industry and research.",
  benchmarkSkills: [
    { name: "Statistics", level: 4, weight: 0.4 },
    { name: "Python", level: 4, weight: 0.4 },
    { name: "SQL", level: 3, weight: 0.2 },
  ],
  assessmentTypes: ["mcq", "coding"],
  mockEvaluation: {
    type: "interview",
    rubric: [
      { criterion: "Technical depth", weight: 0.6 },
      { criterion: "Communication", weight: 0.4 },
    ],
  },
  readinessTarget: 70,
  opportunityTypes: ["job", "internship"],
  examCalendar: [{ name: "GATE (DA)", months: [2] }],
});

/** One-page PDF containing "Jane Doe - Software Engineer" and "Experienced in Python and Kubernetes". */
export const sampleResumePdf = () =>
  fs.readFileSync(path.join(__dirname, "../../test/fixtures/resume.pdf"));
