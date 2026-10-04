/**
 * Seed hand-written exams, jobs and fellowships from data/seeds/opportunities.json, and embed them for matching.
 * Usage: npm run seed:opportunities              (adds new, updates changed, embeds what is missing)
 *        npm run seed:opportunities -- --reembed (recompute every vector, e.g. after changing the embedding model)
 * Needs the ML service for embeddings; without it the opportunities are still saved and matching falls back to keywords.
 */
import mongoose from "mongoose";
import { connectDb } from "../db";
import { seedOpportunities } from "../opportunities/seed";

async function main() {
  await connectDb();
  const r = await seedOpportunities({ reembed: process.argv.includes("--reembed") });
  console.log(
    `created: ${r.created}, updated: ${r.updated}, unchanged: ${r.unchanged}, skipped: ${r.skipped.length}, embedded: ${r.embedded}`,
  );
  for (const s of r.skipped) console.log(`  skipped ${s.seedId}: ${s.reason}`);
  if (r.embedded === 0 && r.created + r.updated > 0) {
    console.log("No vectors were stored: is the ML service running? Re-run once it is.");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
