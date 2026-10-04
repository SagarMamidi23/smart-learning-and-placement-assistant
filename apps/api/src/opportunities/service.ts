import { AppError } from "../errors";
import { getEmbedder } from "../ai/embeddings";
import { logger } from "../logger";
import { DomainConfig } from "../models/DomainConfig";
import { Opportunity, embeddingText } from "../models/Opportunity";

type Fields = {
  domain: string;
  type: string;
  title: string;
  organisation: string;
  location: string;
  eligibility: string;
  deadline: string | null;
  link: string;
  description: string;
  isActive: boolean;
};

/** The opportunity's type must be one its domain actually offers (a banking domain has no apprenticeships). */
export async function assertTypeAllowed(domainSlug: string, type: string) {
  const domain = await DomainConfig.findOne({ slug: domainSlug }).lean();
  if (!domain) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
  if (!domain.opportunityTypes.includes(type as never)) {
    throw new AppError(
      400,
      "TYPE_NOT_SUPPORTED",
      `${domain.name} does not offer "${type}" opportunities. Allowed: ${domain.opportunityTypes.join(", ")}.`,
    );
  }
}

/** Embeds a batch of texts. Returns nulls (never throws) when the embedding service is down, so saving still works. */
export async function tryEmbed(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const embedder = getEmbedder();
    const vectors = await embedder.embed(texts);
    return vectors;
  } catch (e) {
    logger.warn(
      { err: (e as Error).message },
      "could not embed opportunities; saving without vectors",
    );
    return texts.map(() => null);
  }
}

export const toDoc = (f: Fields) => ({
  ...f,
  deadline: f.deadline ? new Date(`${f.deadline}T00:00:00Z`) : null,
});

export async function createOpportunity(
  f: Fields,
  createdBy?: string,
  source: "admin" | "seed" = "admin",
  seedId?: string,
) {
  await assertTypeAllowed(f.domain, f.type);
  const [vec] = await tryEmbed([embeddingText(f)]);
  return Opportunity.create({
    ...toDoc(f),
    source,
    seedId,
    createdBy,
    embedding: vec ?? [],
    embeddingModel: vec ? getEmbedder().model : "",
  });
}

export async function updateOpportunity(id: string, f: Omit<Fields, "domain">) {
  const existing = await Opportunity.findById(id);
  if (!existing) throw new AppError(404, "NOT_FOUND", "Opportunity not found");
  await assertTypeAllowed(existing.domain, f.type);
  const [vec] = await tryEmbed([embeddingText(f)]);
  existing.set({
    ...toDoc({ ...f, domain: existing.domain }),
    embedding: vec ?? [],
    embeddingModel: vec ? getEmbedder().model : "",
  });
  await existing.save();
  return existing;
}

/** Embeds every opportunity that has no vector yet (after the ML service was down, or after a model change). */
export async function reembedMissing() {
  const missing = await Opportunity.find({
    $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }],
  });
  const vectors = await tryEmbed(missing.map((o) => embeddingText(o)));
  let done = 0;
  for (const [i, o] of missing.entries()) {
    const v = vectors[i];
    if (!v) continue;
    o.set({ embedding: v, embeddingModel: getEmbedder().model });
    await o.save();
    done++;
  }
  return { checked: missing.length, embedded: done };
}
