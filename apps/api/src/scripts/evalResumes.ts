/**
 * Resume-based evaluation: for each labelled resume, predict a career domain and report how often it matches the
 * resume's category. Prediction = nearest domain description by embedding similarity (the same model that powers matching).
 *
 * Usage: npm run eval:resumes                 (needs seeded domains and the ML service for embeddings)
 * Reads  data/processed/resume_eval.csv (made by `npm run data:process`), writes data/processed/resume_eval_report.json.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MLEmbedder } from "../ai/embeddings";
import { connectDb } from "../db";
import { DomainConfig } from "../models/DomainConfig";
import { evaluate, rowsFromCsv } from "../opportunities/resumeEval";

const ROOT = path.resolve(__dirname, "../../../..");
const MAX_CHARS = 2500; // the start of a resume (summary, headline, skills) carries the signal; the embedder truncates anyway
const BATCH = 16;

async function main() {
  const csv = path.join(ROOT, "data/processed/resume_eval.csv");
  if (!fs.existsSync(csv))
    throw new Error("data/processed/resume_eval.csv not found: run `npm run data:process` first");
  const all = rowsFromCsv(fs.readFileSync(csv, "utf-8"));
  // The embedding service rejects empty text, and a blank resume has nothing to classify.
  const rows = all.filter((r) => r.text.trim().length > 0);
  const blank = all.length - rows.length;

  await connectDb();
  const domains = await DomainConfig.find({ isActive: true }).lean();
  if (domains.length === 0) throw new Error("No domains: run `npm run seed:domains` first");
  const embedder = new MLEmbedder();

  // A domain is represented by its name, description and its benchmark skill names: what the domain is about, in its own words.
  const domainTexts = domains.map(
    (d) =>
      `${d.name}. ${d.description} Skills: ${d.benchmarkSkills.map((s) => s.name).join(", ")}.`,
  );
  const dv = await embedder.embed(domainTexts);
  const domainVectors = Object.fromEntries(domains.map((d, i) => [d.slug, dv[i]]));

  const vectors: number[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    vectors.push(
      ...(await embedder.embed(rows.slice(i, i + BATCH).map((r) => r.text.slice(0, MAX_CHARS)))),
    );
    process.stdout.write(`\rembedded ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");

  const report = {
    generatedAt: new Date().toISOString(),
    embeddingModel: embedder.model,
    method: "nearest domain description by cosine similarity",
    domainsCompared: domains.length,
    blankResumesSkipped: blank,
    ...evaluate(rows, vectors, domainVectors),
  };
  fs.writeFileSync(
    path.join(ROOT, "data/processed/resume_eval_report.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(
    `resumes: ${report.total} (${blank} blank skipped)  domains: ${report.domainsCompared}`,
  );
  console.log(
    `top-1 match: ${(report.top1 * 100).toFixed(1)}%   top-3: ${(report.top3 * 100).toFixed(1)}%   always-guess-majority baseline: ${(report.majorityBaseline * 100).toFixed(1)}%`,
  );
  for (const [slug, d] of Object.entries(report.perDomain)) {
    console.log(
      `  ${slug.padEnd(12)} n=${String(d.n).padStart(3)}  top-1 ${(d.top1 * 100).toFixed(0)}%  top-3 ${(d.top3 * 100).toFixed(0)}%`,
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
