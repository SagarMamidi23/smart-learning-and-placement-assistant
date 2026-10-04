import { AppError } from "../../errors";
import { StudyChunk, StudyMaterial } from "../../models/StudyMaterial";
import { FakeEmbedder, fixturePdf } from "../../test/fakeEmbedder";
import { setupDb, teardownDb } from "../../test/helpers";
import { setEmbedder } from "../embeddings";
import { chunkPages } from "./chunk";
import { deleteMaterial, ingestMaterial } from "./ingest";
import { invalidateDomain, retrieve } from "./retrieve";

describe("chunkPages", () => {
  const sentence = "This is a sentence about thermodynamics and heat. ";

  it("keeps page numbers and never lets a chunk span pages", () => {
    const chunks = chunkPages([
      { page: 1, text: sentence.repeat(30) },
      { page: 2, text: sentence.repeat(30) },
    ]);
    expect(new Set(chunks.map((c) => c.page))).toEqual(new Set([1, 2]));
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    const firstOnPage2 = chunks.findIndex((c) => c.page === 2);
    expect(chunks.slice(0, firstOnPage2).every((c) => c.page === 1)).toBe(true);
  });

  it("respects the size limit and overlaps consecutive chunks", () => {
    const chunks = chunkPages([{ page: 1, text: sentence.repeat(40) }], {
      size: 300,
      overlap: 80,
      min: 20,
    });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.text.length <= 300 + 80)).toBe(true);
    // The start of each chunk repeats the end of the previous one.
    const prevTail = chunks[0].text.slice(-40);
    expect(chunks[1].text.includes(prevTail.split(" ").slice(-3).join(" "))).toBe(true);
  });

  it("hard-splits a unit longer than the size, drops tiny chunks, and handles empty input", () => {
    const long = chunkPages([{ page: 1, text: "x".repeat(2500) }], {
      size: 1000,
      overlap: 0,
      min: 20,
    });
    expect(long).toHaveLength(3);
    expect(chunkPages([{ page: 1, text: "42" }])).toEqual([]);
    expect(chunkPages([])).toEqual([]);
  });
});

describe("ingest and retrieve", () => {
  const embedder = new FakeEmbedder();
  beforeAll(async () => {
    await setupDb();
    setEmbedder(embedder);
  });
  afterAll(async () => {
    setEmbedder(undefined);
    await teardownDb();
  });
  beforeEach(async () => {
    await StudyChunk.deleteMany({});
    await StudyMaterial.deleteMany({});
    invalidateDomain();
  });

  const thermo = () =>
    ingestMaterial({
      domain: "mechanical",
      title: "Thermodynamics Basics",
      source: "Course notes",
      license: "CC BY 4.0",
      buffer: fixturePdf("thermo.pdf"),
    });

  it("stores chunks tagged with domain, title and page", async () => {
    const m = await thermo();
    expect(m.pages).toBe(2);
    expect(m.chunkCount).toBeGreaterThanOrEqual(2);
    expect(m.embeddingModel).toBe("fake-bow-256");
    const chunks = await StudyChunk.find({ materialId: m._id }).lean();
    expect(
      chunks.every((c) => c.domain === "mechanical" && c.title === "Thermodynamics Basics"),
    ).toBe(true);
    expect(new Set(chunks.map((c) => c.page))).toEqual(new Set([1, 2]));
    expect(chunks[0].embedding).toHaveLength(256);
  });

  it("retrieves the right page for a question, most relevant first", async () => {
    await thermo();
    const hits = await retrieve("mechanical", "entropy of an isolated system never decreases", {
      minScore: 0.1,
    });
    expect(hits[0].page).toBe(1);
    expect(hits[0].text).toContain("entropy");
    expect(hits[0].score).toBeGreaterThan(hits.at(-1)!.score - 1e-9);
    const heat = await retrieve("mechanical", "Explain conduction convection and radiation", {
      minScore: 0.1,
    });
    expect(heat[0].page).toBe(2);
  });

  it("returns nothing for a question the material does not cover", async () => {
    await thermo();
    expect(
      await retrieve("mechanical", "remedies for breach of contract damages", { minScore: 0.3 }),
    ).toEqual([]);
  });

  it("only searches the student's own domain", async () => {
    await thermo();
    await ingestMaterial({
      domain: "law",
      title: "Contract Law",
      source: "Notes",
      license: "CC0",
      buffer: fixturePdf("contract.pdf"),
    });
    const law = await retrieve("law", "remedies for breach of contract", { minScore: 0.2 });
    expect(law.length).toBeGreaterThan(0);
    expect(law.every((h) => h.title === "Contract Law")).toBe(true);
    expect(
      await retrieve("mechanical", "remedies for breach of contract", { minScore: 0.2 }),
    ).toEqual([]);
    expect(await retrieve("healthcare", "anything at all", { minScore: 0 })).toEqual([]);
  });

  it("embeds the chunks in one pass, and the query separately", async () => {
    embedder.calls = [];
    await thermo();
    expect(embedder.calls).toHaveLength(1);
    await retrieve("mechanical", "entropy", { minScore: 0 });
    expect(embedder.calls).toHaveLength(2);
    expect(embedder.calls[1]).toEqual(["entropy"]);
  });

  it("sees new material straight away and forgets deleted material", async () => {
    expect(await retrieve("mechanical", "entropy", { minScore: 0 })).toEqual([]); // primes the cache
    const m = await thermo();
    expect(
      (await retrieve("mechanical", "entropy second law", { minScore: 0.1 })).length,
    ).toBeGreaterThan(0);
    await deleteMaterial(String(m._id));
    expect(await retrieve("mechanical", "entropy second law", { minScore: 0 })).toEqual([]);
    expect(await StudyChunk.countDocuments({})).toBe(0);
  });

  it("leaves nothing behind when embedding fails", async () => {
    setEmbedder({
      model: "broken",
      embed: async () => {
        throw new AppError(503, "EMBEDDING_UNAVAILABLE", "down");
      },
    });
    await expect(thermo()).rejects.toMatchObject({ code: "EMBEDDING_UNAVAILABLE" });
    expect(await StudyMaterial.countDocuments({})).toBe(0);
    expect(await StudyChunk.countDocuments({})).toBe(0);
    setEmbedder(embedder);
  });

  it("rejects non-PDFs and unreadable PDFs", async () => {
    const base = { domain: "mechanical", title: "x y z", source: "s s", license: "l l" };
    await expect(ingestMaterial({ ...base, buffer: Buffer.from("hello") })).rejects.toMatchObject({
      status: 415,
    });
    await expect(
      ingestMaterial({ ...base, buffer: Buffer.from("%PDF-1.4 garbage") }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
