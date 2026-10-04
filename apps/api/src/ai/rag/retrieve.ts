import { config } from "../../config";
import { StudyChunk } from "../../models/StudyMaterial";
import { getEmbedder } from "../embeddings";

export interface Hit {
  materialId: string;
  title: string;
  page: number;
  text: string;
  score: number;
}

interface CachedChunk extends Omit<Hit, "score"> {
  embedding: number[];
  norm: number;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; chunks: CachedChunk[] }>();

/** Call after ingesting or deleting material so the next question sees the change. */
export const invalidateDomain = (domain?: string) =>
  domain ? cache.delete(domain) : cache.clear();

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;

async function chunksFor(domain: string): Promise<CachedChunk[]> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.chunks;
  const rows = await StudyChunk.find({ domain })
    .select("materialId title page text embedding")
    .lean();
  const chunks = rows.map((r) => ({
    materialId: String(r.materialId),
    title: r.title,
    page: r.page,
    text: r.text,
    embedding: r.embedding,
    norm: norm(r.embedding),
  }));
  cache.set(domain, { at: Date.now(), chunks });
  return chunks;
}

/**
 * Top-k passages from one domain's study material, by cosine similarity to the question. Only the student's
 * domain is searched, and anything below `minScore` is dropped, so an empty result means "the material does
 * not cover this" and the caller should refuse rather than guess.
 */
export async function retrieve(
  domain: string,
  question: string,
  opts: { k?: number; minScore?: number } = {},
): Promise<Hit[]> {
  const k = opts.k ?? config.ragTopK;
  const minScore = opts.minScore ?? config.ragMinScore;
  const chunks = await chunksFor(domain);
  if (chunks.length === 0) return [];

  const [q] = await getEmbedder().embed([question]);
  const qn = norm(q);
  const scored: Hit[] = [];
  for (const c of chunks) {
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i] * c.embedding[i];
    const score = dot / (qn * c.norm);
    if (score >= minScore) {
      scored.push({ materialId: c.materialId, title: c.title, page: c.page, text: c.text, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

export async function materialStats(domain: string) {
  const chunks = await chunksFor(domain);
  return { chunks: chunks.length, materials: new Set(chunks.map((c) => c.materialId)).size };
}
