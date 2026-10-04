import fs from "node:fs";
import path from "node:path";
import { opportunityInputSchema } from "@slp/shared";
import { z } from "zod";
import { getEmbedder } from "../ai/embeddings";
import { defaultSeedDir } from "../domains/seed";
import { DomainConfig } from "../models/DomainConfig";
import { Opportunity, embeddingText } from "../models/Opportunity";
import { tryEmbed, toDoc } from "./service";

const seedEntrySchema = opportunityInputSchema.extend({
  seedId: z.string().min(3).max(80),
});

export interface SeedResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: { seedId: string; reason: string }[];
  embedded: number;
}

/**
 * Loads data/seeds/opportunities.json. Idempotent: matched on seedId, so re-running updates the text but never duplicates, and
 * entries added by admins (no seedId) are never touched. Entries that fail validation, name an unknown domain, or use a type the
 * domain does not offer are skipped and reported rather than aborting the whole run.
 */
export async function seedOpportunities(
  opts: { dir?: string; reembed?: boolean } = {},
): Promise<SeedResult> {
  const file = path.join(opts.dir ?? defaultSeedDir(), "opportunities.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, "")) as unknown;
  const entries = Array.isArray(raw)
    ? raw
    : ((raw as { opportunities?: unknown[] }).opportunities ?? []);

  const domains = new Map(
    (await DomainConfig.find({}).lean()).map((d) => [d.slug, d.opportunityTypes as string[]]),
  );
  const result: SeedResult = { created: 0, updated: 0, unchanged: 0, skipped: [], embedded: 0 };
  const toEmbed: { id: unknown; text: string }[] = [];

  for (const e of entries) {
    const label = (e as { seedId?: string })?.seedId ?? "(no seedId)";
    const parsed = seedEntrySchema.safeParse(e);
    if (!parsed.success) {
      result.skipped.push({ seedId: label, reason: parsed.error.issues[0]?.message ?? "invalid" });
      continue;
    }
    const { seedId, ...fields } = parsed.data;
    const types = domains.get(fields.domain);
    if (!types) {
      result.skipped.push({
        seedId,
        reason: `unknown domain "${fields.domain}" (run seed:domains first)`,
      });
      continue;
    }
    if (!types.includes(fields.type)) {
      result.skipped.push({ seedId, reason: `${fields.domain} does not offer "${fields.type}"` });
      continue;
    }

    const doc = { ...toDoc(fields), source: "seed" as const };
    const existing = await Opportunity.findOne({ seedId }).select("+embedding");
    if (!existing) {
      const created = await Opportunity.create({ ...doc, seedId });
      result.created++;
      toEmbed.push({ id: created._id, text: embeddingText(created) });
      continue;
    }
    const before = embeddingText(existing);
    existing.set(doc);
    const textChanged = embeddingText(existing) !== before;
    const changed = existing.isModified();
    if (changed) await existing.save();
    if (changed) result.updated++;
    else result.unchanged++;
    if (textChanged || opts.reembed || !existing.embedding?.length) {
      toEmbed.push({ id: existing._id, text: embeddingText(existing) });
    }
  }

  // Embed in batches so one request stays small.
  for (let i = 0; i < toEmbed.length; i += 32) {
    const batch = toEmbed.slice(i, i + 32);
    const vectors = await tryEmbed(batch.map((b) => b.text));
    for (const [j, v] of vectors.entries()) {
      if (!v) continue;
      await Opportunity.updateOne(
        { _id: batch[j].id },
        { $set: { embedding: v, embeddingModel: getEmbedder().model } },
      );
      result.embedded++;
    }
  }
  return result;
}
