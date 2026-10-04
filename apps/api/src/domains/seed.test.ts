import fs from "node:fs";
import path from "node:path";
import { setupDb, teardownDb } from "../test/helpers";
import { DomainConfig } from "../models/DomainConfig";
import { CURATED_SHARE, defaultSeedDir, mergeBenchmarks, seedDomains } from "./seed";

const SLUGS = [
  "agriculture",
  "banking",
  "civil",
  "electronics",
  "government",
  "healthcare",
  "law",
  "management",
  "mechanical",
  "research",
  "software",
  "teaching",
];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("mergeBenchmarks", () => {
  const curated = [
    { name: "Algorithms", level: 4, weight: 10 },
    { name: "SQL", level: 3, weight: 5 },
  ];
  const onet = [
    { name: "Critical Thinking", level: 4, category: "skill" as const, importance: 4.5 },
    { name: "sql", level: 3, category: "knowledge" as const, importance: 4 },
    { name: "Git", level: 3, category: "tool" as const },
  ];

  it("weights sum to 1 with curated skills taking their share", () => {
    const merged = mergeBenchmarks(curated, onet);
    expect(sum(merged.map((s) => s.weight))).toBeCloseTo(1, 3);
    expect(sum(merged.filter((s) => s.source === "curated").map((s) => s.weight))).toBeCloseTo(
      CURATED_SHARE,
      3,
    );
  });

  it("lets curated skills win on name clashes, case-insensitively", () => {
    const merged = mergeBenchmarks(curated, onet);
    expect(merged.filter((s) => s.name.toLowerCase() === "sql")).toHaveLength(1);
    expect(merged.find((s) => s.name === "SQL")?.source).toBe("curated");
  });

  it("uses all the weight for curated skills when there is no O*NET data", () => {
    const merged = mergeBenchmarks(curated);
    expect(sum(merged.map((s) => s.weight))).toBeCloseTo(1, 3);
    expect(merged.every((s) => s.source === "curated")).toBe(true);
  });

  it("gives tools less weight than skills of high importance", () => {
    const merged = mergeBenchmarks(curated, onet);
    const tool = merged.find((s) => s.name === "Git")!;
    const skill = merged.find((s) => s.name === "Critical Thinking")!;
    expect(tool.weight).toBeLessThan(skill.weight);
  });
});

describe("seed data files", () => {
  const dir = path.join(defaultSeedDir(), "domains");

  it("has exactly the 12 expected domains, named after their slugs", () => {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.map((f) => f.replace(".json", "")).sort()).toEqual(SLUGS);
  });

  it("is consistent with the pipeline's source mapping and derived benchmarks", () => {
    const seeds = defaultSeedDir();
    const sources = JSON.parse(fs.readFileSync(path.join(seeds, "domain_sources.json"), "utf8"));
    const benchmarks = JSON.parse(
      fs.readFileSync(path.join(seeds, "skill_benchmarks.json"), "utf8"),
    );
    const keys = (o: object) =>
      Object.keys(o)
        .filter((k) => !k.startsWith("_"))
        .sort();
    expect(keys(sources)).toEqual(SLUGS);
    expect(keys(benchmarks)).toEqual(SLUGS);
  });

  it("requires a safety notice for Healthcare and Law", () => {
    for (const slug of ["healthcare", "law"]) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), "utf8"));
      expect(d.safetyNotice).toMatch(/Exam and career preparation only/);
    }
  });
});

describe("seedDomains", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);

  it("creates all 12 valid domains, then skips them on re-run", async () => {
    const first = await seedDomains();
    expect(first.created.sort()).toEqual(SLUGS);
    expect(first.onetMerged).toBe(true);
    expect(await DomainConfig.countDocuments()).toBe(12);

    const second = await seedDomains();
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(12);
  });

  it("stores normalised weights and O*NET provenance", async () => {
    for (const d of await DomainConfig.find().lean()) {
      expect(sum(d.benchmarkSkills.map((s) => s.weight))).toBeCloseTo(1, 2);
      expect(d.benchmarkSkills.some((s) => s.source === "curated")).toBe(true);
      expect(d.benchmarkSkills.some((s) => s.source === "onet")).toBe(true);
    }
  });

  it("does not overwrite admin edits unless asked", async () => {
    await DomainConfig.updateOne({ slug: "law" }, { $set: { readinessTarget: 42 } });
    await seedDomains();
    expect((await DomainConfig.findOne({ slug: "law" }))!.readinessTarget).toBe(42);
    const res = await seedDomains({ overwrite: true });
    expect(res.updated).toHaveLength(12);
    expect((await DomainConfig.findOne({ slug: "law" }))!.readinessTarget).toBe(70);
  });
});
