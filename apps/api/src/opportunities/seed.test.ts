import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setEmbedder } from "../ai/embeddings";
import { defaultSeedDir, seedDomains } from "../domains/seed";
import { DomainConfig } from "../models/DomainConfig";
import { Opportunity } from "../models/Opportunity";
import { FakeEmbedder } from "../test/fakeEmbedder";
import { setupDb, teardownDb } from "../test/helpers";
import { evaluate, parseCsv, rowsFromCsv } from "./resumeEval";
import { seedOpportunities } from "./seed";

beforeAll(async () => {
  await setupDb();
  await seedDomains();
  setEmbedder(new FakeEmbedder());
});
afterAll(async () => {
  setEmbedder(undefined);
  await teardownDb();
});
beforeEach(() => Opportunity.deleteMany({}));

describe("the real seed file", () => {
  const entries = JSON.parse(
    fs
      .readFileSync(path.join(defaultSeedDir(), "opportunities.json"), "utf-8")
      .replace(/^[\uFEFF]/, ""),
  ) as { seedId: string; domain: string; link: string; deadline?: unknown }[];

  it("loads every entry with no skips, covers all 12 domains and is idempotent", async () => {
    const first = await seedOpportunities();
    expect(first.skipped).toEqual([]);
    expect(first.created).toBe(entries.length);
    expect(first.embedded).toBe(entries.length);
    const domains = await DomainConfig.countDocuments();
    expect((await Opportunity.distinct("domain")).length).toBe(domains);

    const second = await seedOpportunities();
    expect(second).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: entries.length,
      embedded: 0,
    });
    expect(await Opportunity.countDocuments()).toBe(entries.length);
  });

  it("has unique ids, https links and no invented deadlines", () => {
    expect(new Set(entries.map((e) => e.seedId)).size).toBe(entries.length);
    for (const e of entries) {
      expect(e.link.startsWith("https://")).toBe(true);
      expect(e.deadline ?? null).toBeNull(); // dates change every year; students check the official notice
    }
  });
});

describe("seedOpportunities", () => {
  const withSeed = (items: object[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slp-seed-"));
    fs.writeFileSync(path.join(dir, "opportunities.json"), JSON.stringify(items));
    return dir;
  };
  const item = (over: object = {}) => ({
    seedId: "t-1",
    domain: "software",
    type: "job",
    title: "Test role",
    organisation: "Org",
    link: "https://example.com",
    description: "A long enough description for the validation to pass.",
    ...over,
  });

  it("updates changed text in place, re-embeds only what changed, and leaves admin entries alone", async () => {
    await Opportunity.create({
      domain: "software",
      type: "job",
      title: "Admin made",
      organisation: "X",
      link: "https://example.com",
      description: "Created by an admin, not by the seed file.",
      source: "admin",
    });
    const dir = withSeed([item()]);
    expect((await seedOpportunities({ dir })).created).toBe(1);

    fs.writeFileSync(
      path.join(dir, "opportunities.json"),
      JSON.stringify([item({ title: "Renamed role" })]),
    );
    const r = await seedOpportunities({ dir });
    expect(r).toMatchObject({ created: 0, updated: 1, embedded: 1 });
    expect((await Opportunity.findOne({ seedId: "t-1" }))!.title).toBe("Renamed role");
    expect(await Opportunity.countDocuments()).toBe(2);
    expect((await seedOpportunities({ dir, reembed: true })).embedded).toBe(1);
  });

  it("skips and reports bad entries instead of aborting", async () => {
    const dir = withSeed([
      item({ seedId: "ok-1" }),
      item({ seedId: "bad-link", link: "http://insecure.example.com" }),
      item({ seedId: "bad-domain", domain: "astrology" }),
      item({ seedId: "bad-type", domain: "banking", type: "fellowship" }),
    ]);
    const r = await seedOpportunities({ dir });
    expect(r.created).toBe(1);
    expect(r.skipped.map((s) => s.seedId).sort()).toEqual(["bad-domain", "bad-link", "bad-type"]);
  });
});

describe("resume evaluation maths", () => {
  it("parses quoted CSV with commas, doubled quotes and newlines", () => {
    const rows = parseCsv('id,text\n1,"a, ""b""\nc"\n2,plain\n');
    expect(rows).toEqual([
      ["id", "text"],
      ["1", 'a, "b"\nc'],
      ["2", "plain"],
    ]);
    expect(() => rowsFromCsv("a,b\n1,2\n")).toThrow(/category, domain and text/);
  });

  it("scores top-1, top-3, the majority baseline and records the confusions", () => {
    const dv = { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1], d: [0.5, 0.5, 0] };
    const rows = [
      { category: "A", domain: "a", text: "" },
      { category: "A", domain: "a", text: "" },
      { category: "B", domain: "b", text: "" },
      { category: "C", domain: "c", text: "" },
    ];
    // Resume 1 -> a (hit), 2 -> b (miss, but a is in the top 3), 3 -> b (hit), 4 -> d (miss; c is 3rd or lower)
    const vecs = [
      [1, 0, 0],
      [0.2, 1, 0],
      [0, 1, 0],
      [0.7, 0.7, 0.05],
    ];
    const r = evaluate(rows, vecs, dv);
    expect(r.total).toBe(4);
    expect(r.top1).toBe(0.5);
    expect(r.top3).toBe(0.75);
    expect(r.majorityBaseline).toBe(0.5);
    expect(r.perDomain.a).toEqual({ n: 2, top1: 0.5, top3: 1 });
    expect(r.confusions.a).toEqual({ b: 1 });
    expect(r.confusions.c).toEqual({ d: 1 });
  });
});
