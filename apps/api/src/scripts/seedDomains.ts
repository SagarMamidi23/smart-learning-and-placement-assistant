/**
 * Seed the 12 career domains from data/seeds/.
 * Usage: npm run seed:domains            (adds missing domains only)
 *        npm run seed:domains -- --update (overwrites existing domains, discarding admin edits)
 */
import mongoose from "mongoose";
import { connectDb } from "../db";
import { seedDomains } from "../domains/seed";

async function main() {
  await connectDb();
  const result = await seedDomains({ overwrite: process.argv.includes("--update") });
  console.log(
    `created: ${result.created.length}, updated: ${result.updated.length}, skipped (already present): ${result.skipped.length}`,
  );
  console.log(
    result.onetMerged
      ? "O*NET benchmarks merged."
      : "No skill_benchmarks.json found: seeded curated skills only (run `npm run data:process`).",
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
