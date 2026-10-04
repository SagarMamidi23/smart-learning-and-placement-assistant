import fs from "node:fs";
import path from "node:path";
import { domainConfigSchema, type BenchmarkSkill } from "@slp/shared";
import { DomainConfig } from "../models/DomainConfig";

/** Repo-root data/seeds (same depth from src/ and dist/). Override with SEED_DIR. */
export const defaultSeedDir = () =>
  process.env.SEED_DIR ?? path.resolve(__dirname, "../../../../data/seeds");

/** Share of the total weight given to hand-curated, domain-specific skills. */
export const CURATED_SHARE = 0.75;

interface CuratedSkill {
  name: string;
  level: number;
  weight: number;
}
interface OnetSkill {
  name: string;
  level: number;
  category: "skill" | "knowledge" | "tool";
  importance?: number;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Curated skills carry the domain-specific content; O*NET adds foundation skills, knowledge areas and
 * tools. Curated weights (any positive scale) are normalised to CURATED_SHARE, O*NET weights (proportional
 * to importance; tools get a flat low weight) to the remainder, so the total is 1. Curated wins on name clashes.
 */
export function mergeBenchmarks(curated: CuratedSkill[], onet: OnetSkill[] = []): BenchmarkSkill[] {
  const names = new Set(curated.map((s) => s.name.toLowerCase()));
  const extra = onet.filter((s) => !names.has(s.name.toLowerCase()));
  const curatedShare = extra.length ? CURATED_SHARE : 1;

  const curatedTotal = curated.reduce((s, c) => s + c.weight, 0);
  const raw = (s: OnetSkill) => (s.category === "tool" ? 2 : (s.importance ?? 3));
  const extraTotal = extra.reduce((s, e) => s + raw(e), 0);

  return [
    ...curated.map((s): BenchmarkSkill => ({
      name: s.name,
      level: s.level,
      weight: round((s.weight / curatedTotal) * curatedShare),
      category: "core",
      source: "curated",
    })),
    ...extra.map((s): BenchmarkSkill => ({
      name: s.name,
      level: s.level,
      weight: round((raw(s) / extraTotal) * (1 - curatedShare)),
      category: s.category,
      source: "onet",
    })),
  ];
}

export interface SeedResult {
  created: string[];
  updated: string[];
  skipped: string[];
  onetMerged: boolean;
}

/**
 * Loads data/seeds/domains/*.json, merges O*NET benchmarks if data/seeds/skill_benchmarks.json exists,
 * validates every config and upserts by slug. Existing domains are left alone unless `overwrite` is set,
 * so re-running the seed never clobbers edits made in the admin editor.
 */
export async function seedDomains(
  opts: { seedDir?: string; overwrite?: boolean } = {},
): Promise<SeedResult> {
  const seedDir = opts.seedDir ?? defaultSeedDir();
  const domainsDir = path.join(seedDir, "domains");
  const benchmarksPath = path.join(seedDir, "skill_benchmarks.json");
  const benchmarks: Record<string, { onet?: OnetSkill[] }> = fs.existsSync(benchmarksPath)
    ? JSON.parse(fs.readFileSync(benchmarksPath, "utf8"))
    : {};

  const files = fs
    .readdirSync(domainsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No domain files found in ${domainsDir}`);

  const result: SeedResult = {
    created: [],
    updated: [],
    skipped: [],
    onetMerged: Object.keys(benchmarks).some((k) => !k.startsWith("_")),
  };

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(domainsDir, file), "utf8"));
    const merged = {
      ...raw,
      benchmarkSkills: mergeBenchmarks(raw.benchmarkSkills, benchmarks[raw.slug]?.onet),
    };
    const parsed = domainConfigSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`${file} is invalid: ${JSON.stringify(parsed.error.flatten())}`);
    }
    if (path.basename(file, ".json") !== parsed.data.slug) {
      throw new Error(`${file}: file name must match slug "${parsed.data.slug}"`);
    }

    const existing = await DomainConfig.exists({ slug: parsed.data.slug });
    if (existing && !opts.overwrite) {
      result.skipped.push(parsed.data.slug);
      continue;
    }
    await DomainConfig.replaceOne({ slug: parsed.data.slug }, parsed.data, { upsert: true });
    (existing ? result.updated : result.created).push(parsed.data.slug);
  }
  return result;
}
